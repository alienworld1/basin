import "server-only";
import { createHash } from "node:crypto";
import type { Policy } from "@privy-io/node";

export type ReviewedRouterAbi = Extract<
  Policy["rules"][number]["conditions"][number],
  { field_source: "ethereum_calldata" }
>["abi"];

export type RoutinePolicyDefinition = {
  chain_type: "ethereum";
  name: string;
  version: "1.0";
  owner_id: string;
  rules: Array<{
    name: string;
    method: "eth_sendTransaction";
    action: "ALLOW";
    conditions: Policy["rules"][number]["conditions"];
  }>;
};

export function buildRoutinePolicy(input: {
  ownerId: string;
  routerAddress: `0x${string}`;
  abi: ReviewedRouterAbi;
  limit: string;
}): RoutinePolicyDefinition {
  if (!/^\d+$/.test(input.limit) || BigInt(input.limit) <= 0n)
    throw new Error("Payment controls do not match this Basin deployment.");
  const execute = input.abi.find(
    (item) => item.type === "function" && item.name === "executeObligation",
  );
  const inputs = Array.isArray(execute?.inputs)
    ? (execute.inputs as Array<Record<string, unknown>>)
    : [];
  if (!inputs.some((parameter) => parameter.name === "amount"))
    throw new Error("Payment controls do not match this Basin deployment.");
  return {
    chain_type: "ethereum",
    name: "Basin routine payments",
    version: "1.0",
    owner_id: input.ownerId,
    rules: [
      {
        name: "Allow bounded Basin obligation execution",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: "11155111" },
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: input.routerAddress.toLowerCase() },
          { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
          { field_source: "ethereum_calldata", field: "function_name", operator: "eq", value: "executeObligation", abi: input.abi },
          { field_source: "ethereum_calldata", field: "executeObligation.amount", operator: "lte", value: input.limit, abi: input.abi },
        ],
      },
    ],
  };
}

export function policyFingerprint(definition: RoutinePolicyDefinition) {
  return `0x${createHash("sha256").update(JSON.stringify(definition)).digest("hex")}`;
}

export function observedPolicyFingerprint(policy: Policy) {
  return policyFingerprint({
    chain_type: policy.chain_type as "ethereum",
    name: policy.name,
    version: policy.version,
    owner_id: policy.owner_id ?? "",
    rules: policy.rules.map((rule) => ({
      name: rule.name,
      method: rule.method as "eth_sendTransaction",
      action: rule.action as "ALLOW",
      conditions: rule.conditions,
    })),
  });
}
