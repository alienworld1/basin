import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  RpcRequestError,
  TimeoutError,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { factoryAbi, registryAbi, resolverAbi } from "./abis";
import {
  ENSV2_SEPOLIA_DEPLOYMENT,
  type EnsDeploymentConfig,
} from "./deployment";
import { EnsProtocolError } from "./errors";
import { normalizeBasinLabel, type BasinName } from "./names";
import {
  BASIN_IDENTITY_RECORD_KEY,
  decodeIdentityRecordV1,
  encodeIdentityRecordV1,
} from "./record";
import {
  dnsEncodeName,
  ownedResolverSalt,
  REGISTRY_DANGEROUS_ROLES,
  resolverDataResource,
  resolverNameResource,
  ROLE_REGISTRAR,
  ROLE_SET_DATA,
  roleCountMask,
} from "./roles";
import type {
  IdentityAvailability,
  RegistrationSubmission,
  VerifiedIdentityState,
} from "./types";

const MAX_EXPIRY = (1n << 64n) - 1n;
const PROXY_CREATION_PREFIX =
  "0x3d604d80600a3d3981f3363d3d373d3d3d363d73" as const;
const PROXY_RUNTIME_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

function asProtocolError(error: unknown): EnsProtocolError {
  if (error instanceof EnsProtocolError) return error;
  return new EnsProtocolError(
    "RPC_UNAVAILABLE",
    "The ENSv2 Sepolia service is unavailable.",
  );
}

function isTransportFailure(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (
      current instanceof HttpRequestError ||
      current instanceof RpcRequestError ||
      current instanceof TimeoutError
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function isContractRevert(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof ContractFunctionRevertedError) return true;
    current = current.cause;
  }
  return false;
}

async function readExpectedContract<T>(
  read: () => Promise<T>,
  configurationMessage: string,
) {
  try {
    return await read();
  } catch (error) {
    if (
      error instanceof ContractFunctionExecutionError &&
      (isContractRevert(error) || !isTransportFailure(error))
    ) {
      throw new EnsProtocolError("CONFIGURATION", configurationMessage);
    }
    throw error;
  }
}

function permissionProfileHash(values: readonly (string | bigint | boolean)[]) {
  return keccak256(
    encodeAbiParameters(
      values.map((value) => ({
        type:
          typeof value === "boolean"
            ? ("bool" as const)
            : typeof value === "bigint"
              ? ("uint256" as const)
              : ("string" as const),
      })),
      values,
    ),
  );
}

export function createEnsAdapter(config: EnsDeploymentConfig) {
  const publicClient = createPublicClient({
    chain: sepolia,
    batch: { multicall: true },
    transport: http(config.rpcUrl, { timeout: 8_000, retryCount: 2 }),
  });
  const basinRegistryAddress = getAddress(config.basinRegistryAddress);

  async function assertInfrastructure() {
    try {
      const [chainId, rootCode, ethCode, registryCode, factoryCode, implCode] =
        await Promise.all([
          publicClient.getChainId(),
          publicClient.getCode({
            address: ENSV2_SEPOLIA_DEPLOYMENT.rootRegistry,
          }),
          publicClient.getCode({
            address: ENSV2_SEPOLIA_DEPLOYMENT.ethRegistry,
          }),
          publicClient.getCode({ address: basinRegistryAddress }),
          publicClient.getCode({
            address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
          }),
          publicClient.getCode({
            address:
              ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
          }),
        ]);
      if (
        chainId !== ENSV2_SEPOLIA_DEPLOYMENT.chainId ||
        !rootCode ||
        !ethCode ||
        !registryCode ||
        !factoryCode ||
        !implCode
      ) {
        throw new EnsProtocolError(
          "CONFIGURATION",
          "The ENSv2 deployment does not match the pinned manifest.",
        );
      }
      const [ethPointer, basinPointer, parent, registryImplementation] =
        await Promise.all([
          readExpectedContract(
            () =>
              publicClient.readContract({
                address: ENSV2_SEPOLIA_DEPLOYMENT.rootRegistry,
                abi: registryAbi,
                functionName: "getSubregistry",
                args: ["eth"],
              }),
            "The pinned ENSv2 root registry does not expose the expected interface.",
          ),
          readExpectedContract(
            () =>
              publicClient.readContract({
                address: ENSV2_SEPOLIA_DEPLOYMENT.ethRegistry,
                abi: registryAbi,
                functionName: "getSubregistry",
                args: ["basin"],
              }),
            "The pinned ENSv2 eth registry does not expose the expected interface.",
          ),
          readExpectedContract(
            () =>
              publicClient.readContract({
                address: basinRegistryAddress,
                abi: registryAbi,
                functionName: "getParent",
              }),
            "The configured Basin registry does not expose the expected UserRegistry interface.",
          ),
          readExpectedContract(
            () =>
              publicClient.readContract({
                address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
                abi: factoryAbi,
                functionName: "verifyContract",
                args: [basinRegistryAddress],
              }),
            "The configured Basin registry was not deployed by the pinned ENSv2 factory.",
          ),
        ]);
      if (!sameAddress(ethPointer, ENSV2_SEPOLIA_DEPLOYMENT.ethRegistry)) {
        throw new EnsProtocolError(
          "CONFIGURATION",
          "The ENSv2 eth registry pointer does not match the pinned deployment.",
        );
      }
      if (!sameAddress(basinPointer, basinRegistryAddress)) {
        throw new EnsProtocolError(
          "CONFIGURATION",
          basinPointer === zeroAddress
            ? "The basin.eth ENSv2 namespace has not been provisioned on Sepolia."
            : "ENSV2_BASIN_REGISTRY_ADDRESS is not the registry mounted as basin.eth.",
        );
      }
      if (
        !sameAddress(parent[0], ENSV2_SEPOLIA_DEPLOYMENT.ethRegistry) ||
        parent[1] !== "basin"
      ) {
        throw new EnsProtocolError(
          "CONFIGURATION",
          "The configured registry does not identify basin.eth as its parent name.",
        );
      }
      if (
        !sameAddress(
          registryImplementation,
          ENSV2_SEPOLIA_DEPLOYMENT.userRegistryImplementation,
        )
      ) {
        throw new EnsProtocolError(
          "CONFIGURATION",
          "The configured registry is not a pinned ENSv2 UserRegistry proxy.",
        );
      }
    } catch (error) {
      if (error instanceof EnsProtocolError) throw error;
      throw asProtocolError(error);
    }
  }

  async function availability(
    rawLabel: string,
    requester?: Address,
  ): Promise<IdentityAvailability> {
    const identity = normalizeBasinLabel(rawLabel);
    await assertInfrastructure();
    try {
      const [state, checkedAtBlock] = await Promise.all([
        publicClient.readContract({
          address: basinRegistryAddress,
          abi: registryAbi,
          functionName: "getState",
          args: [BigInt(identity.labelhash)],
        }),
        publicClient.getBlockNumber(),
      ]);
      const owner = getAddress(state.latestOwner);
      const isRegistered = state.status === 2 && owner !== zeroAddress;
      return {
        label: identity.label,
        name: identity.name,
        status: !isRegistered
          ? "AVAILABLE"
          : requester && sameAddress(owner, requester)
            ? "OWNED_BY_REQUESTER"
            : "UNAVAILABLE",
        ...(isRegistered ? { owner } : {}),
        checkedAtBlock: checkedAtBlock.toString(),
      };
    } catch (error) {
      throw asProtocolError(error);
    }
  }

  async function predictResolver(
    registrar: Address,
    controller: Address,
  ): Promise<Address> {
    const salt = ownedResolverSalt(controller);
    const proxyLogic = await publicClient.readContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "proxyLogic",
    });
    const outerSalt = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [registrar, salt],
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

  async function ensureResolver(
    identity: BasinName,
    registrar: Address,
    controller: Address,
    walletClient: ReturnType<typeof createWalletClient>,
  ) {
    const resolverAddress = await predictResolver(registrar, controller);
    const existingCode = await publicClient.getCode({
      address: resolverAddress,
    });
    if (existingCode) {
      const implementation = await publicClient.readContract({
        address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
        abi: factoryAbi,
        functionName: "verifyContract",
        args: [resolverAddress],
      });
      if (
        !sameAddress(
          implementation,
          ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
        )
      ) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The existing resolver does not match Basin's approved deployment.",
        );
      }
      const recordResource = resolverDataResource(
        identity.namehash,
        BASIN_IDENTITY_RECORD_KEY,
      );
      const [registrarRootRoles, controllerRecordRoles] = await Promise.all([
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roles",
          args: [0n, registrar],
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roles",
          args: [recordResource, controller],
        }),
      ]);
      const bootstrapRoles = ROLE_SET_DATA | (ROLE_SET_DATA << 128n);
      if (
        registrarRootRoles === 0n &&
        controllerRecordRoles === ROLE_SET_DATA
      ) {
        return resolverAddress;
      }
      if (
        registrarRootRoles !== bootstrapRoles ||
        controllerRecordRoles !== 0n
      ) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The existing resolver permission profile is not recoverable.",
        );
      }
      await finishResolverPermissions(
        resolverAddress,
        identity,
        registrar,
        controller,
        walletClient,
      );
      return resolverAddress;
    }

    const setters = [
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "setData",
        args: [
          identity.namehash,
          BASIN_IDENTITY_RECORD_KEY,
          encodeIdentityRecordV1(identity.namehash),
        ],
      }),
    ];
    const initData = encodeFunctionData({
      abi: resolverAbi,
      functionName: "initialize",
      args: [registrar, ROLE_SET_DATA | (ROLE_SET_DATA << 128n), setters],
    });
    const hash = await walletClient.writeContract({
      address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [
        ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
        ownedResolverSalt(controller),
        initData,
      ],
      chain: sepolia,
      account: walletClient.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
      confirmations: 1,
    });
    if (receipt.status !== "success") {
      throw new EnsProtocolError(
        "TRANSACTION_REVERTED",
        "The resolver bootstrap transaction reverted.",
      );
    }
    await finishResolverPermissions(
      resolverAddress,
      identity,
      registrar,
      controller,
      walletClient,
    );
    return resolverAddress;
  }

  async function finishResolverPermissions(
    resolverAddress: Address,
    identity: BasinName,
    registrar: Address,
    controller: Address,
    walletClient: ReturnType<typeof createWalletClient>,
  ) {
    const bootstrapRoles = ROLE_SET_DATA | (ROLE_SET_DATA << 128n);
    const calls = [
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "authorizeDataRoles",
        args: [
          dnsEncodeName(identity.name),
          BASIN_IDENTITY_RECORD_KEY,
          controller,
          true,
        ],
      }),
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "revokeRootRoles",
        args: [bootstrapRoles, registrar],
      }),
    ];
    const hash = await walletClient.writeContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "multicall",
      args: [calls],
      chain: sepolia,
      account: walletClient.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
      confirmations: 1,
    });
    if (receipt.status !== "success") {
      throw new EnsProtocolError(
        "TRANSACTION_REVERTED",
        "The resolver permission transaction reverted.",
      );
    }
  }

  async function submitRegistration(
    rawLabel: string,
    controllerInput: Address,
  ): Promise<RegistrationSubmission | VerifiedIdentityState> {
    if (!config.registrarPrivateKey) {
      throw new EnsProtocolError(
        "CONFIGURATION",
        "The Basin namespace registrar is not configured.",
      );
    }
    const identity = normalizeBasinLabel(rawLabel);
    const controller = getAddress(controllerInput);
    const account = privateKeyToAccount(config.registrarPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 0 }),
    });
    await assertInfrastructure();
    const [current, registrarReady, rootRoleCounts] = await Promise.all([
      availability(identity.label, controller),
      publicClient.readContract({
        address: basinRegistryAddress,
        abi: registryAbi,
        functionName: "hasRootRoles",
        args: [ROLE_REGISTRAR, account.address],
      }),
      publicClient.readContract({
        address: basinRegistryAddress,
        abi: registryAbi,
        functionName: "roleCount",
        args: [0n],
      }),
    ]);
    if (
      !registrarReady ||
      (rootRoleCounts & roleCountMask(REGISTRY_DANGEROUS_ROLES)) !== 0n
    ) {
      throw new EnsProtocolError(
        "CONFIGURATION",
        "The Basin namespace registrar profile is not safe.",
      );
    }
    if (current.status === "UNAVAILABLE") {
      throw new EnsProtocolError(
        "COLLISION",
        "That Basin identity is already claimed.",
      );
    }
    if (current.status === "OWNED_BY_REQUESTER") {
      return verifyIdentity(identity.name, controller);
    }
    const resolverAddress = await ensureResolver(
      identity,
      account.address,
      controller,
      walletClient,
    );
    try {
      const transactionHash = await walletClient.writeContract({
        address: basinRegistryAddress,
        abi: registryAbi,
        functionName: "register",
        args: [
          identity.label,
          controller,
          zeroAddress,
          resolverAddress,
          0n,
          MAX_EXPIRY,
        ],
        chain: sepolia,
        account,
      });
      return { name: identity.name, transactionHash, resolverAddress };
    } catch (error) {
      const reread = await availability(identity.label, controller);
      if (reread.status === "UNAVAILABLE") {
        throw new EnsProtocolError(
          "COLLISION",
          "That Basin identity is already claimed.",
        );
      }
      throw asProtocolError(error);
    }
  }

  async function verifyIdentity(
    fullName: string,
    controllerInput: Address,
    transactionHash?: Hash,
    atBlock?: bigint,
  ): Promise<VerifiedIdentityState> {
    const identity = normalizeBasinLabel(
      fullName.endsWith(`.${ENSV2_SEPOLIA_DEPLOYMENT.namespace}`)
        ? fullName.slice(
            0,
            -1 * `.${ENSV2_SEPOLIA_DEPLOYMENT.namespace}`.length,
          )
        : fullName,
    );
    if (identity.name !== fullName) {
      throw new EnsProtocolError(
        "NEEDS_REVIEW",
        "The identity is outside the Basin namespace.",
      );
    }
    const controller = getAddress(controllerInput);
    await assertInfrastructure();
    let blockNumber: bigint;
    if (transactionHash) {
      try {
        const receipt = await publicClient.getTransactionReceipt({
          hash: transactionHash,
        });
        if (receipt.status !== "success") {
          throw new EnsProtocolError(
            "TRANSACTION_REVERTED",
            "The identity transaction reverted.",
          );
        }
        blockNumber = receipt.blockNumber;
      } catch (error) {
        if (error instanceof EnsProtocolError) throw error;
        throw new EnsProtocolError(
          "PENDING",
          "The identity transaction is still pending.",
        );
      }
    } else {
      blockNumber = atBlock ?? (await publicClient.getBlockNumber());
    }
    try {
      const state = await publicClient.readContract({
        address: basinRegistryAddress,
        abi: registryAbi,
        functionName: "getState",
        args: [BigInt(identity.labelhash)],
        blockNumber,
      });
      const owner = getAddress(state.latestOwner);
      if (
        state.status !== 2 ||
        state.expiry <= BigInt(Math.floor(Date.now() / 1000)) ||
        !sameAddress(owner, controller)
      ) {
        throw new EnsProtocolError(
          state.status === 2 && !sameAddress(owner, controller)
            ? "COLLISION"
            : "NEEDS_REVIEW",
          "The registered identity does not match the expected controller.",
        );
      }
      const resolverAddress = getAddress(
        await publicClient.readContract({
          address: basinRegistryAddress,
          abi: registryAbi,
          functionName: "getResolver",
          args: [identity.label],
          blockNumber,
        }),
      );
      if (resolverAddress === zeroAddress) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The identity has no approved resolver.",
        );
      }
      const nameResource = resolverNameResource(identity.namehash);
      const recordResource = resolverDataResource(
        identity.namehash,
        BASIN_IDENTITY_RECORD_KEY,
      );
      const [
        resolverImplementationAddress,
        recordValue,
        registryRoles,
        registryNameCounts,
        registryRootCounts,
        controllerRootRoles,
        controllerNameRoles,
        controllerRecordRoles,
        resolverRootCounts,
        resolverNameCounts,
        resolverRecordCounts,
        registrarApproved,
        block,
      ] = await Promise.all([
        publicClient.readContract({
          address: ENSV2_SEPOLIA_DEPLOYMENT.verifiableFactory,
          abi: factoryAbi,
          functionName: "verifyContract",
          args: [resolverAddress],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "data",
          args: [identity.namehash, BASIN_IDENTITY_RECORD_KEY],
          blockNumber,
        }),
        publicClient.readContract({
          address: basinRegistryAddress,
          abi: registryAbi,
          functionName: "roles",
          args: [state.resource, controller],
          blockNumber,
        }),
        publicClient.readContract({
          address: basinRegistryAddress,
          abi: registryAbi,
          functionName: "roleCount",
          args: [state.resource],
          blockNumber,
        }),
        publicClient.readContract({
          address: basinRegistryAddress,
          abi: registryAbi,
          functionName: "roleCount",
          args: [0n],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roles",
          args: [0n, controller],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roles",
          args: [nameResource, controller],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roles",
          args: [recordResource, controller],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [0n],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [nameResource],
          blockNumber,
        }),
        publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "roleCount",
          args: [recordResource],
          blockNumber,
        }),
        config.registrarPrivateKey
          ? publicClient.readContract({
              address: basinRegistryAddress,
              abi: registryAbi,
              functionName: "isApprovedForAll",
              args: [
                controller,
                privateKeyToAccount(config.registrarPrivateKey).address,
              ],
              blockNumber,
            })
          : Promise.resolve(false),
        publicClient.getBlock({ blockNumber }),
      ]);
      const record = decodeIdentityRecordV1(recordValue);
      const valid =
        sameAddress(
          resolverImplementationAddress,
          ENSV2_SEPOLIA_DEPLOYMENT.permissionedResolverImplementation,
        ) &&
        record.payeeId === identity.namehash &&
        record.identityEpoch === 0n &&
        registryRoles === 0n &&
        registryNameCounts === 0n &&
        (registryRootCounts & roleCountMask(REGISTRY_DANGEROUS_ROLES)) === 0n &&
        controllerRootRoles === 0n &&
        controllerNameRoles === 0n &&
        controllerRecordRoles === ROLE_SET_DATA &&
        resolverRootCounts === 0n &&
        resolverNameCounts === 0n &&
        resolverRecordCounts === ROLE_SET_DATA &&
        !registrarApproved;
      if (!valid) {
        throw new EnsProtocolError(
          "NEEDS_REVIEW",
          "The identity permission profile does not match Basin's policy.",
        );
      }
      const profileHash = permissionProfileHash([
        identity.name,
        state.resource,
        recordResource,
        registryRoles,
        registryNameCounts,
        registryRootCounts,
        controllerRecordRoles,
        resolverRootCounts,
        resolverNameCounts,
        resolverRecordCounts,
        false,
      ]);
      return {
        name: identity.name,
        label: identity.label,
        namehash: identity.namehash,
        payeeId: identity.namehash,
        registryAddress: basinRegistryAddress,
        tokenId: state.tokenId.toString(),
        registryState: "REGISTERED",
        controllerAddress: controller,
        resolverAddress,
        resolverImplementationAddress: getAddress(
          resolverImplementationAddress,
        ),
        recordVersion: 1,
        identityEpoch: "0",
        permissionProfile: {
          valid: true,
          hash: profileHash,
          controllerCanSetIdentityRecord: true,
          transferDisabled: true,
          resolverBootstrapAuthorityRemoved: true,
          registryDangerousAuthorityAbsent: true,
        },
        ...(transactionHash ? { transactionHash } : {}),
        blockNumber: blockNumber.toString(),
        blockTimestamp: new Date(Number(block.timestamp) * 1000),
        verifiedAt: new Date().toISOString(),
        isTransferable: false,
        profileValid: true,
      };
    } catch (error) {
      if (error instanceof EnsProtocolError) throw error;
      throw asProtocolError(error);
    }
  }

  return {
    availability,
    submitRegistration,
    verifyIdentity,
    assertInfrastructure,
  };
}
