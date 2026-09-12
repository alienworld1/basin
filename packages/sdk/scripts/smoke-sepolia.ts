import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { createBasinClient } from "../src/index.js";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} to run the Sepolia smoke check.`);
  return value;
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(required("BASIN_SDK_RPC_URL"), {
    timeout: 10_000,
    retryCount: 1,
  }),
});
const basin = createBasinClient({ publicClient });
const organization = required("BASIN_SDK_ORGANIZATION_ADDRESS") as Address;
const organizationName = required("BASIN_SDK_ORGANIZATION_NAME");
const identityName = required("BASIN_SDK_IDENTITY_NAME");
const payee = await basin.payees.verify({
  organization,
  organizationName,
  identityName,
});
const settlement = await basin.settlement.verify({
  organization,
  organizationName,
  identityName,
});
const identity = await basin.identity.resolve(identityName);
const obligationId = process.env.BASIN_SDK_OBLIGATION_ID;
const obligation = obligationId
  ? await basin.obligations.get(obligationId)
  : undefined;

console.log(
  JSON.stringify(
    { identity, payee, settlement, obligation },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
