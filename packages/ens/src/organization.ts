import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { factoryAbi, registryAbi, resolverAbi } from "./abis";
import { createEnsAdapter } from "./adapter";
import {
  ENSV2_SEPOLIA_DEPLOYMENT,
  type EnsDeploymentConfig,
} from "./deployment";
import { EnsProtocolError } from "./errors";
import { normalizeBasinLabel } from "./names";
import { BASIN_IDENTITY_RECORD_KEY, encodeIdentityRecordV1 } from "./record";
import {
  dnsEncodeName,
  resolverDataResource,
  ROLE_REGISTRAR,
  ROLE_SET_DATA,
  ROLE_UNREGISTER,
} from "./roles";

const MAX_EXPIRY = (1n << 64n) - 1n;
const ROLE_RENEW = 1n << 16n;
const ROLE_SET_PARENT = 1n << 8n;
const ADMIN_SHIFT = 128n;
const LIFECYCLE_ROLES = ROLE_REGISTRAR | ROLE_UNREGISTER | ROLE_RENEW;
const LIFECYCLE_PROFILE = LIFECYCLE_ROLES | (LIFECYCLE_ROLES << ADMIN_SHIFT);
const PARENT_PROFILE = ROLE_SET_PARENT | (ROLE_SET_PARENT << ADMIN_SHIFT);
const PROXY_CREATION_PREFIX =
  "0x3d604d80600a3d3981f3363d3d373d3d3d363d73" as const;
const PROXY_RUNTIME_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

export type OrganizationTransactionSender = (transaction: {
  to: Address;
  data: Hex;
  value: "0x0";
  chainId: 11155111;
  idempotencySuffix: string;
}) => Promise<Hash>;

export type VerifiedOrganizationNamespace = {
  identity: Awaited<
    ReturnType<ReturnType<typeof createEnsAdapter>["verifyIdentity"]>
  >;
  registryAddress: Address;
  registryImplementationAddress: Address;
  verificationBlockNumber: bigint;
  transactionHashes: Hash[];
};

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function createOrganizationNamespaceProvisioner(
  config: EnsDeploymentConfig,
  sendOrganizationTransaction: OrganizationTransactionSender,
) {
  if (!config.registrarPrivateKey) {
    throw new EnsProtocolError(
      "CONFIGURATION",
      "Organization identity setup is unavailable right now.",
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
        "The organization identity transaction reverted.",
      );
    }
    return receipt;
  }

  async function predictProxy(salt: bigint) {
    const proxyLogic = await client.readContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "proxyLogic",
    });
    const outerSalt = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [registrar.address, salt],
      ),
    );
    const creationCode =
      `${PROXY_CREATION_PREFIX}${proxyLogic.slice(2).toLowerCase()}${PROXY_RUNTIME_SUFFIX}${outerSalt.slice(2)}` as Hex;
    return getCreate2Address({
      from: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      salt: outerSalt,
      bytecodeHash: keccak256(creationCode),
    });
  }

  async function ensureProxy(
    implementation: Address,
    salt: bigint,
    initialization: Hex,
    transactions: Hash[],
  ) {
    const address = await predictProxy(salt);
    const code = await client.getCode({ address });
    if (!code) {
      const hash = await wallet.writeContract({
        address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [implementation, salt, initialization],
      });
      await confirmed(hash);
      transactions.push(hash);
    }
    const observed = await client.readContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [address],
    });
    if (!same(observed, implementation)) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The organization namespace deployment needs review.",
      );
    }
    return address;
  }

  async function provision(rawLabel: string, controllerInput: Address) {
    const organization = normalizeBasinLabel(rawLabel);
    const controller = getAddress(controllerInput);
    const transactions: Hash[] = [];
    const adapter = createEnsAdapter(config);
    await adapter.assertInfrastructure();
    const availability = await adapter.availability(
      organization.label,
      controller,
    );
    if (availability.status === "UNAVAILABLE") {
      throw new EnsProtocolError(
        "COLLISION",
        "That organization identity is already registered.",
      );
    }

    const resolverSalt = BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }],
          [
            keccak256(stringToHex(`OrganizationResolver:${organization.name}`)),
            controller,
          ],
        ),
      ),
    );
    const registrySalt = BigInt(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "address" }],
          [
            keccak256(stringToHex(`OrganizationRegistry:${organization.name}`)),
            controller,
          ],
        ),
      ),
    );
    if (availability.status === "OWNED_BY_REQUESTER") {
      const [
        expectedResolver,
        expectedRegistry,
        mountedResolver,
        mountedRegistry,
      ] = await Promise.all([
        predictProxy(resolverSalt),
        predictProxy(registrySalt),
        client.readContract({
          address: config.basinRegistryAddress,
          abi: registryAbi,
          functionName: "getResolver",
          args: [organization.label],
        }),
        client.readContract({
          address: config.basinRegistryAddress,
          abi: registryAbi,
          functionName: "getSubregistry",
          args: [organization.label],
        }),
      ]);
      if (
        !same(expectedResolver, mountedResolver) ||
        !same(expectedRegistry, mountedRegistry)
      ) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "This organization identity already exists without Basin's required relationship registry.",
        );
      }
    }
    const resolverBootstrap = ROLE_SET_DATA | (ROLE_SET_DATA << ADMIN_SHIFT);
    const resolver = await ensureProxy(
      ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
      resolverSalt,
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "initialize",
        args: [
          registrar.address,
          resolverBootstrap,
          [
            encodeFunctionData({
              abi: resolverAbi,
              functionName: "setData",
              args: [
                organization.namehash,
                BASIN_IDENTITY_RECORD_KEY,
                encodeIdentityRecordV1(organization.namehash),
              ],
            }),
          ],
        ],
      }),
      transactions,
    );
    const recordResource = resolverDataResource(
      organization.namehash,
      BASIN_IDENTITY_RECORD_KEY,
    );
    const [controllerRecordRoles, registrarResolverRoles] = await Promise.all([
      client.readContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "roles",
        args: [recordResource, controller],
      }),
      client.readContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "roles",
        args: [0n, registrar.address],
      }),
    ]);
    if (
      controllerRecordRoles !== ROLE_SET_DATA ||
      registrarResolverRoles !== 0n
    ) {
      const hash = await wallet.writeContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "multicall",
        args: [
          [
            encodeFunctionData({
              abi: resolverAbi,
              functionName: "authorizeDataRoles",
              args: [
                dnsEncodeName(organization.name),
                BASIN_IDENTITY_RECORD_KEY,
                controller,
                true,
              ],
            }),
            encodeFunctionData({
              abi: resolverAbi,
              functionName: "revokeRootRoles",
              args: [resolverBootstrap, registrar.address],
            }),
          ],
        ],
      });
      await confirmed(hash);
      transactions.push(hash);
    }

    const registrarBootstrap = LIFECYCLE_PROFILE | PARENT_PROFILE;
    const registry = await ensureProxy(
      ENSV2_SEPOLIA_DEPLOYMENT.userRegistryImplementation,
      registrySalt,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "initialize",
        args: [registrar.address, registrarBootstrap],
      }),
      transactions,
    );
    const organizationRoles = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "roles",
      args: [0n, controller],
    });
    const organizationBootstrap = LIFECYCLE_PROFILE | PARENT_PROFILE;
    if (organizationRoles === 0n) {
      const hash = await wallet.writeContract({
        address: registry,
        abi: registryAbi,
        functionName: "grantRootRoles",
        args: [organizationBootstrap, controller],
      });
      await confirmed(hash);
      transactions.push(hash);
    } else if (
      organizationRoles !== organizationBootstrap &&
      organizationRoles !== LIFECYCLE_PROFILE
    ) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The organization namespace permissions need review.",
      );
    }

    const parent = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "getParent",
    });
    const currentOrganizationRoles = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "roles",
      args: [0n, controller],
    });
    if (
      !same(parent[0], config.basinRegistryAddress) ||
      parent[1] !== organization.label
    ) {
      if ((currentOrganizationRoles & PARENT_PROFILE) !== PARENT_PROFILE) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The organization namespace parent cannot be safely configured.",
        );
      }
      const data = encodeFunctionData({
        abi: registryAbi,
        functionName: "setParent",
        args: [config.basinRegistryAddress, organization.label],
      });
      const hash = await sendOrganizationTransaction({
        to: registry,
        data,
        value: "0x0",
        chainId: 11155111,
        idempotencySuffix: "set-parent",
      });
      await confirmed(hash);
      transactions.push(hash);
    }

    if (availability.status === "AVAILABLE") {
      const hash = await wallet.writeContract({
        address: config.basinRegistryAddress,
        abi: registryAbi,
        functionName: "register",
        args: [
          organization.label,
          controller,
          registry,
          resolver,
          0n,
          MAX_EXPIRY,
        ],
      });
      await confirmed(hash);
      transactions.push(hash);
    }

    if ((currentOrganizationRoles & PARENT_PROFILE) !== 0n) {
      const hash = await sendOrganizationTransaction({
        to: registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "revokeRootRoles",
          args: [PARENT_PROFILE, controller],
        }),
        value: "0x0",
        chainId: 11155111,
        idempotencySuffix: "freeze-parent",
      });
      await confirmed(hash);
      transactions.push(hash);
    }

    const registrarRoles = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "roles",
      args: [0n, registrar.address],
    });
    if (registrarRoles !== 0n) {
      const hash = await wallet.writeContract({
        address: registry,
        abi: registryAbi,
        functionName: "revokeRootRoles",
        args: [registrarRoles, registrar.address],
      });
      await confirmed(hash);
      transactions.push(hash);
    }

    const blockNumber = await client.getBlockNumber();
    const [identity, state, mountedRegistry, mountedResolver, implementation] =
      await Promise.all([
        adapter.verifyIdentity(
          organization.name,
          controller,
          undefined,
          blockNumber,
        ),
        client.readContract({
          address: config.basinRegistryAddress,
          abi: registryAbi,
          functionName: "getState",
          args: [BigInt(organization.labelhash)],
          blockNumber,
        }),
        client.readContract({
          address: config.basinRegistryAddress,
          abi: registryAbi,
          functionName: "getSubregistry",
          args: [organization.label],
          blockNumber,
        }),
        client.readContract({
          address: config.basinRegistryAddress,
          abi: registryAbi,
          functionName: "getResolver",
          args: [organization.label],
          blockNumber,
        }),
        client.readContract({
          address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
          abi: factoryAbi,
          functionName: "verifyContract",
          args: [registry],
          blockNumber,
        }),
      ]);
    const [
      finalParent,
      finalCounts,
      finalOrganizationRoles,
      finalRegistrarRoles,
    ] = await Promise.all([
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getParent",
        blockNumber,
      }),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "roleCount",
        args: [0n],
        blockNumber,
      }),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "roles",
        args: [0n, controller],
        blockNumber,
      }),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "roles",
        args: [0n, registrar.address],
        blockNumber,
      }),
    ]);
    if (
      state.status !== 2 ||
      !same(state.latestOwner, controller) ||
      !same(mountedRegistry, registry) ||
      !same(mountedResolver, resolver) ||
      !same(
        implementation,
        ENSV2_SEPOLIA_DEPLOYMENT.userRegistryImplementation,
      ) ||
      !same(finalParent[0], config.basinRegistryAddress) ||
      finalParent[1] !== organization.label ||
      finalOrganizationRoles !== LIFECYCLE_PROFILE ||
      finalRegistrarRoles !== 0n ||
      finalCounts !== LIFECYCLE_PROFILE
    ) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The organization namespace permissions need review.",
      );
    }
    return {
      identity,
      registryAddress: registry,
      registryImplementationAddress: getAddress(implementation),
      verificationBlockNumber: blockNumber,
      transactionHashes: transactions,
    } satisfies VerifiedOrganizationNamespace;
  }

  return { provision };
}
