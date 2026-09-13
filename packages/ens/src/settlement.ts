import {
  erc20Abi,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { factoryAbi, registryAbi, resolverAbi } from "./abis";
import { normalizeBasinLabel } from "./names";
import { createEnsAdapter } from "./adapter";
import {
  ENSV2_SEPOLIA_DEPLOYMENT as deployment,
  type EnsDeploymentConfig,
} from "./deployment";
import { decodeIdentityRecordV1 } from "./record";
import {
  dnsEncodeName,
  resolverDataResource,
  resolverNameResource,
  ROLE_SET_PARENT,
  ROLE_SET_DATA,
  roleCountMask,
} from "./roles";
import {
  BASIN_SETTLEMENT_RECORD_KEY as key,
  decodeSettlementRecord,
  descriptorRecord,
  nextSettlementEpoch,
  receivingAddress,
  type SettlementDescriptorV1,
} from "./settlement-record";
import { requireSettlement, SettlementError } from "./settlement-errors";

export type RelationshipScope = {
  name: string;
  identityName: string;
  controller: Address;
  identityEpoch: bigint;
  tokenId?: bigint;
  registry?: Address;
};
export type SettlementObservation = Awaited<
  ReturnType<ReturnType<typeof createSettlementAdapter>["read"]>
>;
export type PreparedSettlement = {
  scope: RelationshipScope;
  descriptor: SettlementDescriptorV1;
  expectedRecord: Hex;
  profile: Hex;
  preparedBlock: bigint;
  expiresAt: bigint;
  transaction: {
    to: Address;
    data: Hex;
    value: "0x0";
    chainId: 11155111;
    from: Address;
  };
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const digest = (values: bigint[]) =>
  keccak256(
    encodeAbiParameters(
      values.map(() => ({ type: "uint256" })),
      values,
    ),
  );
// Only payer lifecycle roles and their admins may remain on the isolated registry root.
const payerRoles = (1n << 0n) | (1n << 12n) | (1n << 16n);
const payerMask = roleCountMask(payerRoles | (payerRoles << 128n));

export function createSettlementAdapter(config: EnsDeploymentConfig) {
  const client = createPublicClient({
    chain: sepolia,
    batch: { multicall: true },
    transport: http(config.rpcUrl, { timeout: 8_000, retryCount: 1 }),
  });
  async function verifyAsset(asset: Address, symbol: string) {
    const [chainId, code, actualSymbol] = await Promise.all([
      client.getChainId(),
      client.getCode({ address: asset }),
      client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ]);
    requireSettlement(
      chainId === 11155111 && code && code !== "0x" && actualSymbol === symbol,
      "UNVERIFIED",
    );
  }
  async function read(scope: RelationshipScope, atBlock?: bigint) {
    const labels = scope.name.split(".");
    requireSettlement(
      labels.length === 4 &&
        labels.slice(2).join(".") === "basin.eth" &&
        labels
          .slice(0, 2)
          .every((label) => normalizeBasinLabel(label).label === label),
    );
    requireSettlement(
      scope.identityName === `${scope.name.split(".")[0]}.basin.eth`,
    );
    const block = await client.getBlock(
      atBlock === undefined ? {} : { blockNumber: atBlock },
    );
    const blockNumber = block.number;
    // verifyIdentity validates the full pinned ENSv2 infrastructure before
    // returning. Calling assertInfrastructure here as well duplicated the same
    // RPC-heavy checks for every relationship read and could leave acceptance
    // preparation waiting behind an unhealthy provider.
    await createEnsAdapter(config).verifyIdentity(
      scope.identityName,
      scope.controller,
      undefined,
      blockNumber,
    );
    const [label, organization] = scope.name.split(".");
    const registryRead = (address: Address, resource: bigint) =>
      client.readContract({
        address,
        abi: registryAbi,
        functionName: "roleCount",
        args: [resource],
        blockNumber,
      });
    const stateRead = (address: Address, label: string) =>
      client.readContract({
        address,
        abi: registryAbi,
        functionName: "getState",
        args: [BigInt(labelhash(label))],
        blockNumber,
      });
    const pointer = (address: Address, label: string) =>
      client.readContract({
        address,
        abi: registryAbi,
        functionName: "getSubregistry",
        args: [label],
        blockNumber,
      });
    const [eth, basin, parentState, identityState, parentRootCounts] =
      await Promise.all([
        pointer(deployment.rootRegistry, "eth"),
        pointer(deployment.ethRegistry, "basin"),
        stateRead(config.basinRegistryAddress, organization),
        stateRead(config.basinRegistryAddress, label),
        registryRead(config.basinRegistryAddress, 0n),
      ]);
    requireSettlement(
      same(eth, deployment.ethRegistry) &&
        same(basin, config.basinRegistryAddress),
    );
    requireSettlement(
      parentState.status === 2 && parentState.expiry > block.timestamp,
      "RELATIONSHIP_INACTIVE",
    );
    requireSettlement(
      identityState.status === 2 &&
        identityState.expiry > block.timestamp &&
        same(identityState.latestOwner, scope.controller),
      "REAPPROVAL_REQUIRED",
    );
    const [registry, identityResolver, parentCounts] = await Promise.all([
      pointer(config.basinRegistryAddress, organization),
      client.readContract({
        address: config.basinRegistryAddress,
        abi: registryAbi,
        functionName: "getResolver",
        args: [label],
        blockNumber,
      }),
      registryRead(config.basinRegistryAddress, parentState.resource),
    ]);
    requireSettlement(
      registry !== zeroAddress &&
        (!scope.registry || same(registry, scope.registry)),
      "REAPPROVAL_REQUIRED",
    );
    const [
      state,
      resolver,
      identityBytes,
      rootCounts,
      registryImplementation,
      parent,
    ] = await Promise.all([
      stateRead(registry, label),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getResolver",
        args: [label],
        blockNumber,
      }),
      client.readContract({
        address: identityResolver,
        abi: resolverAbi,
        functionName: "data",
        args: [namehash(scope.identityName), "basin.identity"],
        blockNumber,
      }),
      registryRead(registry, 0n),
      client.readContract({
        address: deployment.verifiableFactory,
        abi: factoryAbi,
        functionName: "verifyContract",
        args: [registry],
        blockNumber,
      }),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getParent",
        blockNumber,
      }),
    ]);
    const identity = decodeIdentityRecordV1(identityBytes);
    requireSettlement(
      identity.payeeId === namehash(scope.identityName) &&
        identity.identityEpoch === scope.identityEpoch,
      "REAPPROVAL_REQUIRED",
    );
    requireSettlement(
      state.status === 2 && state.expiry > block.timestamp,
      "RELATIONSHIP_INACTIVE",
    );
    requireSettlement(
      same(state.latestOwner, scope.controller) &&
        (scope.tokenId === undefined || state.tokenId === scope.tokenId),
      "REAPPROVAL_REQUIRED",
    );
    requireSettlement(
      same(registryImplementation, deployment.userRegistryImplementation) &&
        same(parent[0], config.basinRegistryAddress) &&
        parent[1] === organization,
    );
    const node = namehash(scope.name);
    const resources = [
      0n,
      resolverNameResource(node),
      resolverDataResource(zeroHash, key),
      resolverDataResource(node, key),
    ];
    const [
      counts,
      controllerRoles,
      nameCounts,
      controllerRegistryRoot,
      implementation,
      record,
    ] = await Promise.all([
      Promise.all(
        resources.map((resource) =>
          client.readContract({
            address: resolver,
            abi: resolverAbi,
            functionName: "roleCount",
            args: [resource],
            blockNumber,
          }),
        ),
      ),
      client.readContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "roles",
        args: [resources[3], scope.controller],
        blockNumber,
      }),
      registryRead(registry, state.resource),
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "roles",
        args: [0n, scope.controller],
        blockNumber,
      }),
      client.readContract({
        address: deployment.verifiableFactory,
        abi: factoryAbi,
        functionName: "verifyContract",
        args: [resolver],
        blockNumber,
      }),
      client.readContract({
        address: resolver,
        abi: resolverAbi,
        functionName: "data",
        args: [node, key],
        blockNumber,
      }),
    ]);
    verifyRelationshipPermissionProfile({
      counts,
      controllerRoles,
      rootCounts,
      nameCounts,
      controllerRegistryRoot,
      parentRootCounts,
      parentCounts,
    });
    requireSettlement(
      same(implementation, deployment.permissionedResolverImplementation),
    );
    const alias = await client.readContract({
      address: resolver,
      abi: resolverAbi,
      functionName: "getAlias",
      args: [dnsEncodeName(scope.name)],
      blockNumber,
    });
    requireSettlement(alias === "0x");
    const code = await client.getCode({ address: implementation, blockNumber });
    requireSettlement(code && code !== "0x", "UNVERIFIED");
    const resolverProfile = digest([...resources, ...counts, controllerRoles]);
    const registryProfile = digest([
      rootCounts,
      nameCounts,
      controllerRegistryRoot,
      parentRootCounts,
      parentCounts,
    ]);
    const profile = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "address" },
          { type: "uint256" },
          { type: "address" },
          { type: "address" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        [
          identity.payeeId,
          scope.controller,
          identity.identityEpoch,
          registry,
          state.tokenId,
          resolver,
          implementation,
          keccak256(code),
          resolverProfile,
          registryProfile,
        ],
      ),
    );
    let decoded = null;
    if (record !== "0x") {
      try {
        decoded = decodeSettlementRecord(record);
      } catch {
        throw new SettlementError("NEEDS_REVIEW");
      }
    }
    return {
      name: scope.name,
      registry,
      tokenId: state.tokenId,
      resolver,
      implementation,
      implementationCodeHash: keccak256(code),
      resolverProfile,
      registryProfile,
      profile,
      record,
      decoded,
      blockNumber,
      blockHash: block.hash,
      timestamp: block.timestamp,
      identityEpoch: identity.identityEpoch,
      controller: scope.controller,
    };
  }
  async function prepare(
    scope: RelationshipScope,
    asset: Address,
    destination: Address,
    known: { record: Hex; destination: Address } | null,
  ): Promise<PreparedSettlement> {
    const state = await read(scope);
    requireSettlement(state.record === (known?.record ?? "0x"), "STALE");
    const normalized = receivingAddress(destination, [
      state.registry,
      state.resolver,
      config.basinRegistryAddress,
      ...Object.values(deployment)
        .map(String)
        .filter((value) => value.startsWith("0x")),
    ]);
    if (known && same(normalized, known.destination))
      throw new SettlementError(
        "INVALID_INPUT",
        "This is already your receiving account.",
      );
    const descriptor: SettlementDescriptorV1 = {
      version: 1,
      chainId: 11155111n,
      asset: receivingAddress(asset),
      destination: normalized,
      settlementEpoch: nextSettlementEpoch(
        state.decoded?.settlementEpoch ?? null,
      ),
      validFrom: state.timestamp,
    };
    const data = encodeFunctionData({
      abi: resolverAbi,
      functionName: "setData",
      args: [namehash(scope.name), key, descriptorRecord(descriptor)],
    });
    await client.simulateContract({
      address: state.resolver,
      abi: resolverAbi,
      functionName: "setData",
      args: [namehash(scope.name), key, descriptorRecord(descriptor)],
      account: scope.controller,
    });
    return {
      scope: { ...scope, registry: state.registry, tokenId: state.tokenId },
      descriptor,
      expectedRecord: state.record,
      profile: state.profile,
      preparedBlock: state.blockNumber,
      expiresAt: state.timestamp + 600n,
      transaction: {
        to: state.resolver,
        data,
        value: "0x0",
        chainId: 11155111,
        from: scope.controller,
      },
    };
  }
  async function revalidate(prepared: PreparedSettlement) {
    const state = await read(prepared.scope);
    requireSettlement(
      state.timestamp < prepared.expiresAt &&
        state.record === prepared.expectedRecord &&
        state.profile === prepared.profile,
      "STALE",
    );
    return prepared.transaction;
  }
  async function verify(prepared: PreparedSettlement, hash: Hex) {
    const [transaction, receipt, head] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
      client.getBlockNumber({ cacheTime: 0 }),
    ]);
    requireSettlement(
      same(transaction.from, prepared.scope.controller) &&
        !!transaction.to &&
        same(transaction.to, prepared.transaction.to) &&
        transaction.input === prepared.transaction.data &&
        transaction.value === 0n &&
        transaction.chainId === 11155111,
      "NEEDS_REVIEW",
    );
    requireSettlement(receipt.status === "success", "REVERTED");
    requireSettlement(head >= receipt.blockNumber + 1n, "PENDING");
    requireSettlement(
      transaction.blockHash === receipt.blockHash &&
        transaction.blockNumber === receipt.blockNumber,
    );
    const [atReceipt, current] = await Promise.all([
      read(prepared.scope, receipt.blockNumber),
      read(prepared.scope, head),
    ]);
    requireSettlement(atReceipt.blockHash === receipt.blockHash);
    requireSettlement(
      atReceipt.record === descriptorRecord(prepared.descriptor) &&
        current.record === atReceipt.record,
    );
    requireSettlement(
      atReceipt.profile === prepared.profile &&
        current.profile === prepared.profile,
      "REAPPROVAL_REQUIRED",
    );
    return {
      current,
      receiptBlock: receipt.blockNumber,
      receiptBlockHash: receipt.blockHash,
      transactionHash: hash,
    };
  }
  // Bounded recovery; ambiguity remains unresolved instead of inviting another write.
  async function locate(prepared: PreparedSettlement) {
    const head = await client.getBlockNumber({ cacheTime: 0 });
    const end =
      head < prepared.preparedBlock + 64n ? head : prepared.preparedBlock + 64n;
    const matches: Hex[] = [];
    const numbers = Array.from(
      { length: Number(end - prepared.preparedBlock + 1n) },
      (_, i) => prepared.preparedBlock + BigInt(i),
    );
    const deadline = Date.now() + 45_000;
    for (let offset = 0; offset < numbers.length; offset += 8) {
      if (Date.now() > deadline) throw new SettlementError("PENDING");
      const blocks = await Promise.all(
        numbers
          .slice(offset, offset + 8)
          .map((blockNumber) =>
            client.getBlock({ blockNumber, includeTransactions: true }),
          ),
      );
      for (const block of blocks)
        for (const tx of block.transactions)
          if (
            same(tx.from, prepared.scope.controller) &&
            tx.to &&
            same(tx.to, prepared.transaction.to) &&
            tx.input === prepared.transaction.data &&
            tx.value === 0n
          )
            matches.push(tx.hash);
    }
    return matches.length === 1 ? matches[0] : null;
  }
  return { read, prepare, revalidate, verify, locate, verifyAsset, client };
}
export function verifyRelationshipPermissionProfile(value: {
  counts: bigint[];
  controllerRoles: bigint;
  rootCounts: bigint;
  nameCounts: bigint;
  controllerRegistryRoot: bigint;
  parentRootCounts: bigint;
  parentCounts: bigint;
}) {
  requireSettlement(
    value.counts.length === 4 &&
      value.counts.slice(0, 3).every((count) => count === 0n) &&
      value.counts[3] === ROLE_SET_DATA &&
      value.controllerRoles === ROLE_SET_DATA,
  );
  requireSettlement(
    (value.rootCounts & ~payerMask) === 0n &&
      value.nameCounts === 0n &&
      value.controllerRegistryRoot === 0n,
  );
  // The Basin registry's regular SET_PARENT role only maintains its canonical
  // parent declaration. The root -> eth -> basin pointers are read and checked
  // independently above. Its admin role remains forbidden here.
  const upstreamAllowed = roleCountMask(
    (1n << 0n) | ROLE_SET_PARENT | (1n << 16n) | (1n << 128n) | (1n << 144n),
  );
  requireSettlement(
    (value.parentRootCounts & ~upstreamAllowed) === 0n &&
      value.parentCounts === 0n,
  );
}
