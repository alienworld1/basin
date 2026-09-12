import {
  basinRouterAbi,
  basinRouterActivationAbi,
  securityRootCommitment,
} from "@basin/contracts";
import {
  BASIN_IDENTITY_RECORD_KEY,
  BASIN_SETTLEMENT_RECORD_KEY,
  decodeIdentityRecordV1,
  decodeSettlementRecord,
  deriveRelationshipName,
  normalizeBasinIdentityInput,
  normalizeBasinLabel,
  resolverDataResource,
  resolverNameResource,
  ROLE_SET_DATA,
  verifyRelationshipPermissionProfile,
} from "@basin/ens";
import {
  namehash,
  getAddress,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { factoryAbi, registryAbi, resolverAbi } from "@basin/ens";
import { BASIN_SEPOLIA_V1, type BasinDeployment } from "./deployment";
import { BasinSdkError, sdkError } from "./errors";
import { decodeBasinEvent } from "./events";
import type {
  ApprovedPayeeInspection,
  BasinClientConfig,
  IdentityInspection,
  ObligationInspection,
  ReceiptEvidence,
  ReceiptVerification,
  SettlementDescriptorV1,
  SettlementInspection,
} from "./types";
import {
  descriptorRecord,
  encodeSettlementRecord,
} from "@basin/ens";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hash = (value: string, field = "protocol identifier") => {
  if (!/^0x[\da-fA-F]{64}$/.test(value))
    throw new BasinSdkError(
      "INVALID_INPUT",
      `The supplied ${field} is invalid.`,
    );
  return value.toLowerCase() as Hex;
};
const address = (value: string) => {
  try {
    return getAddress(value);
  } catch {
    throw new BasinSdkError(
      "INVALID_INPUT",
      "The supplied address is invalid.",
    );
  }
};
const profileDigest = (values: readonly bigint[]) =>
  keccak256(
    encodeAbiParameters(
      values.map(() => ({ type: "uint256" })),
      values,
    ),
  );

/** Creates a read-only, wallet-agnostic client for Basin's shipped Sepolia v1 protocol. */
export function createBasinClient(config: BasinClientConfig) {
  const deployment: BasinDeployment = config.deployment ?? BASIN_SEPOLIA_V1;
  if (!config.publicClient)
    throw new BasinSdkError(
      "INVALID_INPUT",
      "A viem public client is required.",
    );
  if (deployment.chainId !== 11155111n || deployment.protocolVersion !== "1")
    throw new BasinSdkError(
      "UNSUPPORTED_NETWORK",
      "This Basin SDK version supports Ethereum Sepolia only.",
    );
  const client = config.publicClient;
  const observe = async () => {
    try {
      const [chainId, block, routerVersion, asset] = await Promise.all([
        client.getChainId(),
        client.getBlock(),
        client.readContract({
          address: deployment.router,
          abi: basinRouterAbi,
          functionName: "VERSION",
        }),
        client.readContract({
          address: deployment.router,
          abi: basinRouterAbi,
          functionName: "asset",
        }),
      ]);
      if (
        BigInt(chainId) !== deployment.chainId ||
        !block.hash ||
        block.number === null
      )
        throw new BasinSdkError(
          "UNSUPPORTED_NETWORK",
          "This Basin SDK version supports Ethereum Sepolia only.",
        );
      if (
        routerVersion !== deployment.protocolVersion ||
        !same(asset, deployment.asset)
      )
        throw new BasinSdkError(
          "INVALID_DEPLOYMENT",
          "The configured Basin deployment does not match supported v1 protocol evidence.",
        );
      return {
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: block.timestamp,
      };
    } catch (error) {
      throw sdkError(error);
    }
  };
  const normalizeIdentity = (input: string) => {
    try {
      return normalizeBasinIdentityInput(input);
    } catch (cause) {
      throw new BasinSdkError(
        "INVALID_INPUT",
        "Enter a valid Basin identity.",
        undefined,
        { cause },
      );
    }
  };
  const resolve = async (input: string): Promise<IdentityInspection> => {
    const normalized = normalizeIdentity(input);
    const at = await observe();
    try {
      const state = await client.readContract({
        address: deployment.basinRegistry,
        abi: registryAbi,
        functionName: "getState",
        args: [BigInt(normalized.labelhash)],
        blockNumber: at.blockNumber,
      });
      if (
        state.status !== 2 ||
        state.latestOwner === "0x0000000000000000000000000000000000000000"
      )
        return {
          ...at,
          name: normalized.name,
          node: normalized.namehash,
          exists: false,
          status: "NOT_FOUND",
          registry: deployment.basinRegistry,
        };
      const resolver = await client.readContract({
        address: deployment.basinRegistry,
        abi: registryAbi,
        functionName: "getResolver",
        args: [normalized.label],
        blockNumber: at.blockNumber,
      });
      if (resolver === "0x0000000000000000000000000000000000000000")
        return {
          ...at,
          name: normalized.name,
          node: normalized.namehash,
          exists: true,
          status: "REAPPROVAL_REQUIRED",
          controller: getAddress(state.latestOwner),
          registry: deployment.basinRegistry,
        };
      const record = await client.readContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "data",
        args: [normalized.namehash, BASIN_IDENTITY_RECORD_KEY],
        blockNumber: at.blockNumber,
      });
      if (record === "0x")
        return {
          ...at,
          name: normalized.name,
          node: normalized.namehash,
          exists: true,
          status: "REAPPROVAL_REQUIRED",
          controller: getAddress(state.latestOwner),
          registry: deployment.basinRegistry,
          resolver,
        };
      let decoded;
      try {
        decoded = decodeIdentityRecordV1(record);
      } catch (cause) {
        throw new BasinSdkError(
          "UNSUPPORTED_VERSION",
          "This Basin protocol version is not supported by this SDK.",
          undefined,
          { cause },
        );
      }
      return {
        ...at,
        name: normalized.name,
        node: normalized.namehash,
        exists: true,
        status: state.expiry > at.timestamp ? "ACTIVE" : "REAPPROVAL_REQUIRED",
        recordVersion: 1,
        payeeId: decoded.payeeId,
        identityEpoch: decoded.identityEpoch,
        controller: getAddress(state.latestOwner),
        registry: deployment.basinRegistry,
        resolver,
      };
    } catch (error) {
      throw sdkError(error);
    }
  };
  const verifyProfile = async (value: {
    identity: IdentityInspection;
    organizationLabel: string;
    relationshipName: string;
    relationshipNode: Hex;
    registry: Address;
    resolver: Address;
    relationshipResource: bigint;
    relationshipTokenId: bigint;
    blockNumber: bigint;
  }) => {
    if (
      !value.identity.controller ||
      !value.identity.payeeId ||
      value.identity.identityEpoch === undefined
    )
      return { verified: false as const, reason: "UNAVAILABLE" as const };
    try {
      const resources = [
        0n,
        resolverNameResource(value.relationshipNode),
        resolverDataResource(
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          BASIN_SETTLEMENT_RECORD_KEY,
        ),
        resolverDataResource(
          value.relationshipNode,
          BASIN_SETTLEMENT_RECORD_KEY,
        ),
      ];
      const parentState = await client.readContract({
        address: deployment.basinRegistry,
        abi: registryAbi,
        functionName: "getState",
        args: [BigInt(normalizeBasinLabel(value.organizationLabel).labelhash)],
        blockNumber: value.blockNumber,
      });
      const [
        counts,
        controllerRoles,
        rootCounts,
        nameCounts,
        controllerRegistryRoot,
        parentRootCounts,
        parentCounts,
        implementation,
        code,
      ] = await Promise.all([
        Promise.all(
          resources.map((resource) =>
            client.readContract({
              address: value.resolver,
              abi: resolverAbi,
              functionName: "roleCount",
              args: [resource],
              blockNumber: value.blockNumber,
            }),
          ),
        ),
        client.readContract({
          address: value.resolver,
          abi: resolverAbi,
          functionName: "roles",
          args: [resources[3], value.identity.controller],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: value.registry,
          abi: registryAbi,
          functionName: "roleCount",
          args: [0n],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: value.registry,
          abi: registryAbi,
          functionName: "roleCount",
          args: [value.relationshipResource],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: value.registry,
          abi: registryAbi,
          functionName: "roles",
          args: [0n, value.identity.controller],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: deployment.basinRegistry,
          abi: registryAbi,
          functionName: "roleCount",
          args: [0n],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: deployment.basinRegistry,
          abi: registryAbi,
          functionName: "roleCount",
          args: [parentState.resource],
          blockNumber: value.blockNumber,
        }),
        client.readContract({
          address: deployment.ens.verifiableFactory,
          abi: factoryAbi,
          functionName: "verifyContract",
          args: [value.resolver],
          blockNumber: value.blockNumber,
        }),
        // The v1 security root commits to the verified implementation's code,
        // not the mutable proxy runtime at the resolver address.
        client.getCode({
          address: deployment.ens.permissionedResolverImplementation,
          blockNumber: value.blockNumber,
        }),
      ]);
      if (
        !code ||
        !same(implementation, deployment.ens.permissionedResolverImplementation)
      )
        return { verified: false as const, reason: "MISMATCH" as const };
      verifyRelationshipPermissionProfile({
        counts: [...counts],
        controllerRoles,
        rootCounts,
        nameCounts,
        controllerRegistryRoot,
        parentRootCounts,
        parentCounts,
      });
      return {
        verified: true as const,
        securityRootCommitment: securityRootCommitment({
          payeeId: value.identity.payeeId,
          identityController: value.identity.controller,
          identityEpoch: value.identity.identityEpoch,
          relationshipRegistry: value.registry,
          relationshipTokenId: value.relationshipTokenId,
          resolverProxy: value.resolver,
          resolverImplementation: implementation,
          resolverImplementationCodeHash: keccak256(code),
          resolverPermissionProfileHash: profileDigest([
            ...resources,
            ...counts,
            controllerRoles,
          ]),
          registryPermissionProfileHash: profileDigest([
            rootCounts,
            nameCounts,
            controllerRegistryRoot,
            parentRootCounts,
            parentCounts,
          ]),
        }),
      };
    } catch {
      return { verified: false as const, reason: "MISMATCH" as const };
    }
  };
  const payee = async (input: {
    organizationName: string;
    organization: Address;
    identityName: string;
  }): Promise<ApprovedPayeeInspection> => {
    const identity = await resolve(input.identityName);
    const organization = (() => {
      try {
        return normalizeBasinLabel(input.organizationName);
      } catch {
        throw new BasinSdkError(
          "INVALID_INPUT",
          "Enter a valid Basin organization.",
        );
      }
    })();
    const at = await observe();
    const relationshipName = deriveRelationshipName(
      identity.name,
      organization.label,
    );
    const relationshipNode = namehash(relationshipName);
    try {
      const registry = await client.readContract({
        address: deployment.basinRegistry,
        abi: registryAbi,
        functionName: "getSubregistry",
        args: [organization.label],
        blockNumber: at.blockNumber,
      });
      if (registry === "0x0000000000000000000000000000000000000000")
        return {
          ...at,
          organizationName: organization.name,
          identityName: identity.name,
          relationshipName,
          relationshipNode,
          status: "PENDING",
          active: false,
          activation: null,
          permissionProfile: { verified: false, reason: "UNAVAILABLE" },
        };
      const state = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getState",
        args: [
          BigInt(normalizeBasinLabel(identity.name.split(".")[0]).labelhash),
        ],
        blockNumber: at.blockNumber,
      });
      if (state.status !== 2)
        return {
          ...at,
          organizationName: organization.name,
          identityName: identity.name,
          relationshipName,
          relationshipNode,
          status: "PENDING",
          active: false,
          activation: null,
          permissionProfile: { verified: false, reason: "UNAVAILABLE" },
          registry,
        };
      const resolver = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getResolver",
        args: [identity.name.split(".")[0]],
        blockNumber: at.blockNumber,
      });
      const accepted = await client.readContract({
        address: deployment.activation,
        abi: basinRouterActivationAbi,
        functionName: "acceptedRoot",
        args: [address(input.organization), relationshipNode, state.tokenId],
        blockNumber: at.blockNumber,
      });
      const permissionProfile = await verifyProfile({
        identity,
        organizationLabel: organization.label,
        relationshipName,
        relationshipNode,
        registry,
        resolver,
        relationshipResource: state.resource,
        relationshipTokenId: state.tokenId,
        blockNumber: at.blockNumber,
      });
      const activated =
        permissionProfile.verified &&
        accepted[0] === permissionProfile.securityRootCommitment &&
        accepted[1] === identity.payeeId &&
        accepted[2] >= at.timestamp;
      const status =
        state.expiry <= at.timestamp
          ? "EXPIRED"
          : activated && identity.status === "ACTIVE"
            ? "ACTIVE"
            : "REAPPROVAL_REQUIRED";
      return {
        ...at,
        organizationName: organization.name,
        identityName: identity.name,
        relationshipName,
        relationshipNode,
        relationshipTokenId: state.tokenId,
        expiresAt: state.expiry,
        status:
          !permissionProfile.verified && status === "ACTIVE"
            ? "REAPPROVAL_REQUIRED"
            : status,
        active: status === "ACTIVE" && permissionProfile.verified,
        activation:
          accepted[0] ===
          "0x0000000000000000000000000000000000000000000000000000000000000000"
            ? null
            : {
                securityRootCommitment: accepted[0],
                payeeId: accepted[1],
                expiresAt: accepted[2],
                nonce: accepted[3],
              },
        permissionProfile,
        registry,
        resolver,
      };
    } catch (error) {
      throw sdkError(error);
    }
  };
  const settlement = async (input: {
    organizationName: string;
    organization: Address;
    identityName: string;
  }): Promise<SettlementInspection> => {
    const relationship = await payee(input);
    if (
      !relationship.resolver ||
      relationship.relationshipTokenId === undefined
    )
      return {
        blockNumber: relationship.blockNumber,
        blockHash: relationship.blockHash,
        relationshipName: relationship.relationshipName,
        available: false,
        permissionProfile: relationship.permissionProfile,
      };
    try {
      const record = await client.readContract({
        address: relationship.resolver,
        abi: resolverAbi,
        functionName: "data",
        args: [relationship.relationshipNode, BASIN_SETTLEMENT_RECORD_KEY],
        blockNumber: relationship.blockNumber,
      });
      if (record === "0x")
        return {
          blockNumber: relationship.blockNumber,
          blockHash: relationship.blockHash,
          relationshipName: relationship.relationshipName,
          relationshipTokenId: relationship.relationshipTokenId,
          available: false,
          permissionProfile: relationship.permissionProfile,
        };
      const decoded = decodeSettlementRecord(record);
      return {
        blockNumber: relationship.blockNumber,
        blockHash: relationship.blockHash,
        relationshipName: relationship.relationshipName,
        relationshipTokenId: relationship.relationshipTokenId,
        recordVersion: 1,
        settlementEpoch: decoded.settlementEpoch,
        commitment: decoded.commitment,
        available: relationship.active,
        permissionProfile: relationship.permissionProfile,
      };
    } catch (error) {
      throw sdkError(error);
    }
  };
  const obligation = async (
    obligationId: string,
  ): Promise<ObligationInspection> => {
    const id = hash(obligationId, "protocol identifier");
    const at = await observe();
    try {
      const value = await client.readContract({
        address: deployment.router,
        abi: basinRouterAbi,
        functionName: "getObligation",
        args: [id],
        blockNumber: at.blockNumber,
      });
      if (!value.exists)
        return { ...at, obligationId: id, status: "NOT_FOUND" };
      const status = value.cancelled
        ? "CANCELLED"
        : value.validUntil <= at.timestamp
          ? "EXPIRED"
          : value.remainingAmount === 0n
            ? "CONSUMED"
            : "ACTIVE";
      return {
        ...at,
        obligationId: id,
        organization: getAddress(value.organization),
        relationshipNode: value.relationshipNamehash,
        relationshipTokenId: value.relationshipTokenId,
        payeeId: value.payeeId,
        securityRootCommitment: value.securityRootCommitment,
        maxAmount: value.maxAmount,
        remainingAmount: value.remainingAmount,
        validUntil: value.validUntil,
        metadataHash: value.metadataHash,
        status,
      };
    } catch (error) {
      throw sdkError(error);
    }
  };
  const preparePayment = async (input: {
    obligationId: string;
    paymentId: string;
    amount: bigint;
    descriptor: SettlementDescriptorV1;
    organizationName: string;
    organization: Address;
    identityName: string;
  }) => {
    if (typeof input.amount !== "bigint" || input.amount <= 0n)
      throw new BasinSdkError(
        "INVALID_INPUT",
        "The payment amount is outside this obligation's available amount.",
      );
    const [currentObligation, currentPayee, currentSettlement] =
      await Promise.all([
        obligation(input.obligationId),
        payee(input),
        settlement(input),
      ]);
    if (
      currentObligation.status !== "ACTIVE" ||
      !currentObligation.remainingAmount ||
      currentObligation.remainingAmount < input.amount
    )
      throw new BasinSdkError(
        "INACTIVE",
        "The payment amount is outside this obligation's available amount.",
      );
    if (!currentPayee.active || !currentPayee.activation)
      throw new BasinSdkError(
        currentPayee.status === "REAPPROVAL_REQUIRED"
          ? "REAPPROVAL_REQUIRED"
          : "INACTIVE",
        "This Approved Payee is not active for payment.",
      );
    if (
      !currentSettlement.available ||
      !currentSettlement.commitment ||
      currentSettlement.settlementEpoch === undefined ||
      descriptorRecord(input.descriptor).slice(-64).toLowerCase() !==
        currentSettlement.commitment.slice(2).toLowerCase()
    )
      throw new BasinSdkError(
        "STALE_PREPARATION",
        "The receiving details no longer match the payee's current settlement authority.",
      );
    if (
      input.descriptor.chainId !== deployment.chainId ||
      !same(input.descriptor.asset, deployment.asset) ||
      input.descriptor.settlementEpoch !== currentSettlement.settlementEpoch
    )
      throw new BasinSdkError(
        "INVALID_INPUT",
        "The receiving details no longer match the payee's current settlement authority.",
      );
    if (
      !currentObligation.organization ||
      !same(currentObligation.organization, input.organization) ||
      currentObligation.relationshipNode !== currentPayee.relationshipNode ||
      currentObligation.relationshipTokenId !==
        currentPayee.relationshipTokenId ||
      currentObligation.payeeId !== currentPayee.activation.payeeId ||
      currentObligation.securityRootCommitment !==
        currentPayee.activation.securityRootCommitment
    )
      throw new BasinSdkError(
        "INVALID_EVIDENCE",
        "The obligation does not match the current Approved Payee authority.",
      );
    const paymentId = hash(input.paymentId, "payment identifier");
    const consumed = await client.readContract({
      address: deployment.router,
      abi: basinRouterAbi,
      functionName: "consumedPaymentIds",
      args: [paymentId],
      blockNumber: currentObligation.blockNumber,
    });
    if (consumed)
      throw new BasinSdkError(
        "CONFLICT",
        "This payment identifier has already been used.",
      );
    const data = encodeFunctionData({
      abi: basinRouterAbi,
      functionName: "executeObligation",
      args: [
        currentObligation.obligationId,
        input.descriptor,
        input.amount,
        paymentId,
        {
          identityLabel: currentPayee.identityName.split(".")[0],
          organizationLabel: currentPayee.organizationName.split(".")[0],
          relationshipRegistry: currentPayee.registry!,
          resolver: currentPayee.resolver!,
          identityEpoch: (await resolve(input.identityName)).identityEpoch!,
        },
      ],
    });
    return {
      protocolVersion: "1" as const,
      chainId: deployment.chainId,
      requiredAuthority: "PAYMENT_OPERATOR" as const,
      calls: [
        { to: deployment.router, data, value: 0n, chainId: deployment.chainId },
      ] as const,
      typedData: null,
      review: {
        obligation: currentObligation,
        payee: currentPayee,
        settlement: currentSettlement,
      },
      expiresAt: currentObligation.validUntil!,
    };
  };
  const paymentStatus = async (input: {
    paymentId: string;
    transactionHash?: Hex;
  }) => {
    const paymentId = hash(input.paymentId, "payment identifier");
    if (!input.transactionHash) {
      const consumed = await client.readContract({
        address: deployment.router,
        abi: basinRouterAbi,
        functionName: "consumedPaymentIds",
        args: [paymentId],
      });
      return {
        paymentId,
        transactionHash: null,
        status: consumed
          ? ("EVIDENCE_UNAVAILABLE" as const)
          : ("NOT_FOUND" as const),
      };
    }
    try {
      const receipt = await client.getTransactionReceipt({
        hash: input.transactionHash,
      });
      if (receipt.status === "reverted")
        return {
          paymentId,
          transactionHash: input.transactionHash,
          status: "FAILED" as const,
        };
      const matches = receipt.logs
        .map((log) => {
          try {
            return decodeBasinEvent(log, deployment.router);
          } catch {
            return null;
          }
        })
        .filter(
          (event) =>
            event?.name === "ObligationExecuted" &&
            event.args.paymentId === paymentId,
        );
      return {
        paymentId,
        transactionHash: input.transactionHash,
        status:
          matches.length === 1
            ? ("SETTLED" as const)
            : ("EVIDENCE_UNAVAILABLE" as const),
        event: matches[0] ?? undefined,
      };
    } catch {
      return {
        paymentId,
        transactionHash: input.transactionHash,
        status: "PENDING" as const,
      };
    }
  };
  const verifyReceipt = async (
    evidence: ReceiptEvidence,
  ): Promise<ReceiptVerification> => {
    const checks: {
      field: string;
      status: "MATCH" | "MISMATCH" | "UNAVAILABLE";
    }[] = [];
    try {
      const [receipt, head] = await Promise.all([
        client.getTransactionReceipt({ hash: evidence.transactionHash }),
        client.getBlockNumber(),
      ]);
      if (receipt.status !== "success")
        return {
          verificationStatus: "INVALID",
          checks: [{ field: "transactionStatus", status: "MISMATCH" }],
        };
      if (head < receipt.blockNumber + 1n)
        return {
          verificationStatus: "EVIDENCE_UNAVAILABLE",
          checks: [{ field: "confirmations", status: "UNAVAILABLE" }],
        };
      const events = receipt.logs
        .map((log) => {
          try {
            return decodeBasinEvent(log, deployment.router);
          } catch {
            return null;
          }
        })
        .filter(
          (event) =>
            event?.name === "ObligationExecuted" &&
            event.args.paymentId === evidence.paymentId,
        );
      if (events.length !== 1)
        return {
          verificationStatus: "INVALID",
          checks: [{ field: "paymentEvent", status: "MISMATCH" }],
        };
      const event = events[0]!;
      const obligationAtPayment = await client.readContract({
        address: deployment.router,
        abi: basinRouterAbi,
        functionName: "getObligation",
        args: [evidence.obligationId],
        blockNumber: receipt.blockNumber,
      });
      const expected: ReadonlyArray<
        readonly [string, string | bigint | undefined, string | bigint]
      > = [
        ["paymentId", event.args.paymentId, evidence.paymentId],
        ["obligationId", event.args.obligationId, evidence.obligationId],
        [
          "organization",
          String(event.args.organization).toLowerCase(),
          evidence.organization.toLowerCase(),
        ],
        [
          "relationshipNode",
          event.args.relationshipNamehash,
          evidence.relationshipNode,
        ],
        [
          "relationshipTokenId",
          event.args.relationshipTokenId,
          evidence.relationshipTokenId,
        ],
        ["payeeId", event.args.payeeId, evidence.payeeId],
        [
          "settlementEpoch",
          event.args.settlementEpoch,
          evidence.settlementEpoch,
        ],
        [
          "settlementCommitment",
          event.args.settlementCommitment,
          evidence.settlementCommitment,
        ],
        ["amount", event.args.amount, evidence.amount],
        [
          "asset",
          String(event.args.asset).toLowerCase(),
          evidence.asset.toLowerCase(),
        ],
        ["metadataHash", event.args.metadataHash, evidence.metadataHash],
        [
          "securityRoot",
          obligationAtPayment.securityRootCommitment,
          evidence.paymentTimeAuthority.securityRootCommitment,
        ],
        [
          "settlementDescriptor",
          descriptorRecord(evidence.paymentTimeAuthority.descriptor),
          encodeSettlementRecord({
            version: 1,
            settlementEpoch: evidence.settlementEpoch,
            commitment: evidence.settlementCommitment,
          }),
        ],
      ];
      for (const [field, actual, expectedValue] of expected)
        checks.push({
          field,
          status: actual === expectedValue ? "MATCH" : "MISMATCH",
        });
      return {
        verificationStatus: checks.every((check) => check.status === "MATCH")
          ? "VERIFIED"
          : "INVALID",
        checks,
        event,
      };
    } catch {
      return {
        verificationStatus: "EVIDENCE_UNAVAILABLE",
        checks: [{ field: "chainEvidence", status: "UNAVAILABLE" }],
      };
    }
  };
  const prepareApproval = async (input: {
    organizationName: string;
    organization: Address;
    identityName: string;
    acceptanceSignature?: Hex;
  }) => {
    const current = await payee(input);
    if (current.active)
      throw new BasinSdkError(
        "CONFLICT",
        "This Approved Payee is already active.",
      );
    if (
      !current.relationshipTokenId ||
      !current.activation ||
      !current.permissionProfile.verified ||
      !current.permissionProfile.securityRootCommitment
    )
      throw new BasinSdkError(
        "REAPPROVAL_REQUIRED",
        "The relationship must be provisioned and its permission profile verified before acceptance can be prepared.",
      );
    const identity = await resolve(input.identityName);
    if (
      !identity.controller ||
      !identity.payeeId ||
      identity.identityEpoch === undefined ||
      !current.registry ||
      !current.resolver
    )
      throw new BasinSdkError(
        "EVIDENCE_UNAVAILABLE",
        "The relationship authority evidence is unavailable.",
      );
    const nonce = await client.readContract({
      address: deployment.activation,
      abi: basinRouterActivationAbi,
      functionName: "nextNonce",
      args: [current.relationshipNode],
      blockNumber: current.blockNumber,
    });
    const message = {
      organization: address(input.organization),
      relationshipNamehash: current.relationshipNode,
      relationshipTokenId: current.relationshipTokenId,
      payeeId: identity.payeeId,
      securityRootCommitment: current.permissionProfile.securityRootCommitment,
      expiry: current.expiresAt!,
      nonce,
    };
    const typedData = {
      domain: {
        name: "BasinRouter",
        version: "1",
        chainId: Number(deployment.chainId),
        verifyingContract: deployment.activation,
      },
      types: {
        AcceptApprovedPayee: [
          { name: "organization", type: "address" },
          { name: "relationshipNamehash", type: "bytes32" },
          { name: "relationshipTokenId", type: "uint256" },
          { name: "payeeId", type: "bytes32" },
          { name: "securityRootCommitment", type: "bytes32" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "AcceptApprovedPayee" as const,
      message,
    };
    if (!input.acceptanceSignature)
      return {
        protocolVersion: "1" as const,
        stages: [
          {
            requiredAuthority: "PAYEE" as const,
            calls: [] as const,
            typedData,
            review: current,
          },
        ] as const,
      };
    const call = {
      to: deployment.activation,
      data: encodeFunctionData({
        abi: basinRouterActivationAbi,
        functionName: "activateApprovedPayee",
        args: [
          message,
          identity.controller,
          input.acceptanceSignature,
          {
            identityLabel: identity.name.split(".")[0],
            organizationLabel: current.organizationName.split(".")[0],
            relationshipRegistry: current.registry,
            resolver: current.resolver,
            identityEpoch: identity.identityEpoch,
          },
        ],
      }),
      value: 0n as const,
      chainId: deployment.chainId,
    };
    return {
      protocolVersion: "1" as const,
      stages: [
        {
          requiredAuthority: "PAYEE" as const,
          calls: [] as const,
          typedData,
          review: current,
        },
        {
          requiredAuthority: "ORGANIZATION_ADMIN" as const,
          calls: [call] as const,
          typedData: null,
          review: current,
        },
      ] as const,
    };
  };
  return {
    identity: {
      normalize: (input: string) => normalizeIdentity(input).name,
      resolve,
      inspectLifecycle: resolve,
    },
    payees: { get: payee, verify: payee, prepareApproval },
    settlement: { get: settlement, verify: settlement },
    obligations: { get: obligation },
    payments: { prepare: preparePayment, getStatus: paymentStatus },
    receipts: { verify: verifyReceipt },
  };
}

export type BasinClient = ReturnType<typeof createBasinClient>;
