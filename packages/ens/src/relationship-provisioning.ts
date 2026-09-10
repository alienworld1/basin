import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  labelhash,
  namehash,
  stringToHex,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { factoryAbi, registryAbi, resolverAbi } from "./abis";
import type { EnsDeploymentConfig } from "./deployment";
import { ENSV2_SEPOLIA_DEPLOYMENT } from "./deployment";
import { EnsProtocolError } from "./errors";
import { normalizeBasinLabel } from "./names";
import { createSettlementAdapter } from "./settlement";
import { BASIN_SETTLEMENT_RECORD_KEY } from "./settlement-record";
import {
  dnsEncodeName,
  resolverDataResource,
  resolverNameResource,
  ROLE_SET_DATA,
} from "./roles";

const ADMIN_SHIFT = 128n;
const RESOLVER_BOOTSTRAP = ROLE_SET_DATA | (ROLE_SET_DATA << ADMIN_SHIFT);
const PROXY_CREATION_PREFIX =
  "0x3d604d80600a3d3981f3363d3d373d3d3d363d73" as const;
const PROXY_RUNTIME_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

export type RelationshipTransactionSender = (transaction: {
  to: Address;
  data: Hex;
  value: "0x0";
  chainId: 11155111;
  idempotencySuffix: string;
}) => Promise<Hash>;

const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export function createRelationshipProvisioner(
  config: EnsDeploymentConfig,
  sendOrganizationTransaction: RelationshipTransactionSender,
) {
  if (!config.registrarPrivateKey) {
    throw new EnsProtocolError(
      "CONFIGURATION",
      "Relationship setup is unavailable right now.",
    );
  }
  const registrar = privateKeyToAccount(config.registrarPrivateKey);
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
  const wallet = createWalletClient({
    account: registrar,
    chain: sepolia,
    transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 0 }),
  });

  async function confirmed(hash: Hash) {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      throw new EnsProtocolError(
        "TRANSACTION_REVERTED",
        "The relationship transaction reverted.",
      );
    }
    return receipt;
  }

  async function predictResolver(
    name: string,
    controller: Address,
    salt: bigint,
  ) {
    const proxyLogic = await client.readContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "proxyLogic",
    });
    const deploymentSalt = BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
          [
            keccak256(stringToHex(`RelationshipResolver:${name}`)),
            controller,
            salt,
          ],
        ),
      ),
    );
    const outerSalt = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [registrar.address, deploymentSalt],
      ),
    );
    const creationCode =
      `${PROXY_CREATION_PREFIX}${proxyLogic.slice(2).toLowerCase()}${PROXY_RUNTIME_SUFFIX}${outerSalt.slice(2)}` as Hex;
    return {
      address: getCreate2Address({
        from: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
        salt: outerSalt,
        bytecodeHash: keccak256(creationCode),
      }),
      deploymentSalt,
    };
  }

  async function ensureResolver(
    name: string,
    controller: Address,
    salt: bigint,
    transactions: Hash[],
  ) {
    const predicted = await predictResolver(name, controller, salt);
    const code = await client.getCode({ address: predicted.address });
    if (!code) {
      const hash = await wallet.writeContract({
        address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [
          ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
          predicted.deploymentSalt,
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "initialize",
            args: [registrar.address, RESOLVER_BOOTSTRAP, []],
          }),
        ],
      });
      await confirmed(hash);
      transactions.push(hash);
    }
    const implementation = await client.readContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [predicted.address],
    });
    if (
      !same(
        implementation,
        ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
      )
    ) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The relationship resolver deployment needs review.",
      );
    }
    const resource = resolverDataResource(
      namehash(name),
      BASIN_SETTLEMENT_RECORD_KEY,
    );
    const [controllerRoles, registrarRoles] = await Promise.all([
      client.readContract({
        address: predicted.address,
        abi: resolverAbi,
        functionName: "roles",
        args: [resource, controller],
      }),
      client.readContract({
        address: predicted.address,
        abi: resolverAbi,
        functionName: "roles",
        args: [0n, registrar.address],
      }),
    ]);
    if (controllerRoles !== ROLE_SET_DATA || registrarRoles !== 0n) {
      const calls: Hex[] = [];
      if (controllerRoles === 0n) {
        calls.push(
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "authorizeDataRoles",
            args: [
              dnsEncodeName(name),
              BASIN_SETTLEMENT_RECORD_KEY,
              controller,
              true,
            ],
          }),
        );
      } else if (controllerRoles !== ROLE_SET_DATA) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The relationship resolver permissions need review.",
        );
      }
      if (registrarRoles !== 0n) {
        calls.push(
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "revokeRootRoles",
            args: [registrarRoles, registrar.address],
          }),
        );
      }
      const hash = await wallet.writeContract({
        address: predicted.address,
        abi: resolverAbi,
        functionName: "multicall",
        args: [calls],
      });
      await confirmed(hash);
      transactions.push(hash);
    }
    const [rootCount, nameCount, recordCount, finalControllerRoles] =
      await Promise.all([
        client.readContract({
          address: predicted.address,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [0n],
        }),
        client.readContract({
          address: predicted.address,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [resolverNameResource(namehash(name))],
        }),
        client.readContract({
          address: predicted.address,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [resource],
        }),
        client.readContract({
          address: predicted.address,
          abi: resolverAbi,
          functionName: "roles",
          args: [resource, controller],
        }),
      ]);
    if (
      rootCount !== 0n ||
      nameCount !== 0n ||
      recordCount !== ROLE_SET_DATA ||
      finalControllerRoles !== ROLE_SET_DATA
    ) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The relationship resolver permissions need review.",
      );
    }
    return predicted.address;
  }

  async function provision(input: {
    name: string;
    identityName: string;
    controller: Address;
    identityEpoch: bigint;
    registry: Address;
    expiry: bigint;
    generationSalt: bigint;
    replaceExisting?: boolean;
  }) {
    const [label, organization, basin, eth] = input.name.split(".");
    if (
      !label ||
      !organization ||
      basin !== "basin" ||
      eth !== "eth" ||
      normalizeBasinLabel(label).label !== label ||
      input.identityName !== `${label}.basin.eth`
    ) {
      throw new EnsProtocolError(
        "INVALID_LABEL",
        "The relationship name is invalid.",
      );
    }
    const controller = getAddress(input.controller);
    const registry = getAddress(input.registry);
    const transactions: Hash[] = [];
    const resolver = await ensureResolver(
      input.name,
      controller,
      input.generationSalt,
      transactions,
    );
    let state = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getState",
      args: [BigInt(labelhash(label))],
    });
    if (state.status === 2 && input.replaceExisting) {
      if (!same(state.latestOwner, controller)) {
        throw new EnsProtocolError(
          "COLLISION",
          "This relationship name is already in use.",
        );
      }
      const hash = await sendOrganizationTransaction({
        to: registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "unregister",
          args: [state.tokenId],
        }),
        value: "0x0",
        chainId: 11155111,
        idempotencySuffix: "replace-relationship",
      });
      await confirmed(hash);
      transactions.push(hash);
      state = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getState",
        args: [BigInt(labelhash(label))],
      });
    }
    if (state.status === 0) {
      const hash = await sendOrganizationTransaction({
        to: registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "register",
          args: [label, controller, zeroAddress, resolver, 0n, input.expiry],
        }),
        value: "0x0",
        chainId: 11155111,
        idempotencySuffix: "register-relationship",
      });
      await confirmed(hash);
      transactions.push(hash);
    } else if (
      state.status !== 2 ||
      !same(state.latestOwner, controller) ||
      state.expiry !== input.expiry ||
      !same(
        await client.readContract({
          address: registry,
          abi: registryAbi,
          functionName: "getResolver",
          args: [label],
        }),
        resolver,
      )
    ) {
      throw new EnsProtocolError(
        "COLLISION",
        "This relationship name is already in use.",
      );
    }
    const observed = await createSettlementAdapter(config).read({
      name: input.name,
      identityName: input.identityName,
      controller,
      identityEpoch: input.identityEpoch,
      registry,
    });
    return { observed, transactionHashes: transactions };
  }

  async function revoke(input: {
    registry: Address;
    tokenId: bigint;
    label: string;
  }) {
    const registry = getAddress(input.registry);
    const current = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getState",
      args: [input.tokenId],
    });
    const transactions: Hash[] = [];
    if (current.status === 2) {
      if (current.tokenId !== input.tokenId) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The relationship generation changed before revocation.",
        );
      }
      const hash = await sendOrganizationTransaction({
        to: registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "unregister",
          args: [input.tokenId],
        }),
        value: "0x0",
        chainId: 11155111,
        idempotencySuffix: "unregister-relationship",
      });
      await confirmed(hash);
      transactions.push(hash);
    }
    const finalState = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getState",
      args: [BigInt(labelhash(input.label))],
    });
    if (finalState.status !== 0) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The relationship revocation needs review.",
      );
    }
    return { transactionHashes: transactions };
  }

  return { provision, revoke };
}
