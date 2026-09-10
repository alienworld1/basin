import { basinRouterActivationAbi } from "@basin/contracts";
import { createPublicClient, getAddress, http, namehash } from "viem";
import { sepolia } from "viem/chains";

import { createRelationshipReader } from "../src/relationships";
import { readLiveEnvironment } from "./environment";

const [
  relationshipName,
  identityName,
  controller,
  identityEpoch,
  organizationWallet,
] = process.argv.slice(2);

if (
  !relationshipName ||
  !identityName ||
  !controller ||
  !identityEpoch ||
  !organizationWallet
) {
  throw new Error(
    "Usage: pnpm --filter @basin/ens verify:relationship <relationship> <identity> <controller> <identityEpoch> <organizationWallet>",
  );
}

const reader = createRelationshipReader(readLiveEnvironment());
const environment = readLiveEnvironment();
const observed = await reader.observe({
  name: relationshipName,
  identityName,
  controller: getAddress(controller),
  identityEpoch: BigInt(identityEpoch),
});
const routerInput = process.env.BASIN_ACTIVATION_ROUTER_ADDRESS?.trim();
if (!routerInput) {
  throw new Error(
    "Set BASIN_ACTIVATION_ROUTER_ADDRESS before running this check.",
  );
}
const router = getAddress(routerInput);
const accepted = await createPublicClient({
  chain: sepolia,
  transport: http(environment.rpcUrl, { timeout: 8_000, retryCount: 1 }),
}).readContract({
  address: router,
  abi: basinRouterActivationAbi,
  functionName: "acceptedRoot",
  args: [
    getAddress(organizationWallet),
    namehash(relationshipName),
    observed.tokenId,
  ],
  blockNumber: observed.blockNumber,
});
if (
  accepted[0] !== observed.profile ||
  accepted[1] !== namehash(identityName) ||
  accepted[2] <= observed.timestamp
) {
  throw new Error(
    "The Router acceptance does not match the live ENS relationship.",
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      relationship: observed.name,
      organizationWallet: getAddress(organizationWallet),
      activationRouter: router,
      activationNonce: accepted[3].toString(),
      acceptedExpiry: accepted[2].toString(),
      registry: observed.registry,
      tokenId: observed.tokenId.toString(),
      resolver: observed.resolver,
      resolverImplementation: observed.implementation,
      implementationCodeHash: observed.implementationCodeHash,
      resolverPermissionProfileHash: observed.resolverProfile,
      registryPermissionProfileHash: observed.registryProfile,
      securityRootCommitment: observed.profile,
      blockNumber: observed.blockNumber.toString(),
      blockHash: observed.blockHash,
    },
    null,
    2,
  )}\n`,
);
