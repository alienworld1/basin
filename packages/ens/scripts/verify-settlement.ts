import {
  ContractFunctionRevertedError,
  encodeFunctionData,
  getAddress,
  namehash,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  createSettlementAdapter,
  dnsEncodeName,
  ENSV2_SEPOLIA_DEPLOYMENT,
  ROLE_SET_DATA,
} from "../src/index";
import { resolverAbi } from "../src/abis";
import { readLiveEnvironment } from "./environment";

async function main() {
  const [name, controllerInput, payerInput, operatorInput] =
    process.argv.slice(2);
  if (!name || !controllerInput || !payerInput || !operatorInput)
    throw new Error(
      "Pass relationship name, expected controller, payer, and operator addresses.",
    );
  const controller = getAddress(controllerInput),
    payer = getAddress(payerInput),
    operator = getAddress(operatorInput);
  if (new Set([controller, payer, operator]).size !== 3)
    throw new Error("Use three distinct accounts.");
  const adapter = createSettlementAdapter(readLiveEnvironment());
  const state = await adapter.read({
    name,
    identityName: `${name.split(".")[0]}.basin.eth`,
    controller,
    identityEpoch: 0n,
  });
  if (!state.decoded)
    throw new Error(
      "Establish a settlement record with the isolated controller harness first.",
    );
  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: "setData",
    args: [namehash(name), "basin.settlement", state.record],
  });
  const denied = async (account: Address, data: Hex) => {
    try {
      await adapter.client.call({ account, to: state.resolver, data });
    } catch (error) {
      let source = error;
      for (let i = 0; i < 10 && source instanceof Error; i++) {
        if (
          source instanceof ContractFunctionRevertedError ||
          source.name === "ExecutionRevertedError"
        )
          return true;
        source = source.cause;
      }
      throw new Error(
        "Authorization test could not establish a contract denial.",
      );
    }
    throw new Error("An unauthorized contract call was accepted.");
  };
  await adapter.client.call({ account: controller, to: state.resolver, data });
  const extraAbi = parseAbi([
    "function clearRecords(bytes32 node)",
    "function setAlias(bytes fromName,bytes toName)",
    "function grantRootRoles(uint256 roleBitmap,address account) returns (bool)",
  ]);
  const tests = [
    ["payer settlement write", payer, data],
    ["operator settlement write", operator, data],
    [
      "controller other record",
      controller,
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "setData",
        args: [namehash(name), "basin.identity", state.record],
      }),
    ],
    [
      "controller other relationship",
      controller,
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "setData",
        args: [
          namehash(`other.${name.split(".").slice(1).join(".")}`),
          "basin.settlement",
          state.record,
        ],
      }),
    ],
    [
      "controller clear records",
      controller,
      encodeFunctionData({
        abi: extraAbi,
        functionName: "clearRecords",
        args: [namehash(name)],
      }),
    ],
    [
      "controller alias",
      controller,
      encodeFunctionData({
        abi: extraAbi,
        functionName: "setAlias",
        args: [
          dnsEncodeName(name),
          dnsEncodeName(`other.${name.split(".").slice(1).join(".")}`),
        ],
      }),
    ],
    [
      "controller restore root role",
      controller,
      encodeFunctionData({
        abi: extraAbi,
        functionName: "grantRootRoles",
        args: [ROLE_SET_DATA, controller],
      }),
    ],
  ] as const;
  const results: Record<string, boolean> = {};
  for (const [label, account, call] of tests)
    results[label] = await denied(account, call);
  process.stdout.write(
    JSON.stringify({
      deployment: ENSV2_SEPOLIA_DEPLOYMENT.sourceCommit,
      chain: "11155111",
      name,
      controller,
      registry: state.registry,
      resolver: state.resolver,
      tokenId: state.tokenId.toString(),
      settlementEpoch: state.decoded.settlementEpoch.toString(),
      commitment: state.decoded.commitment,
      block: state.blockNumber.toString(),
      blockHash: state.blockHash,
      authorizationDenials: results,
    }) + "\n",
  );
}
main().catch(() => {
  process.stderr.write(
    "Settlement verification could not complete. Pass the relationship, controller, payer and operator; check fixture permissions and RPC access.\n",
  );
  process.exitCode = 1;
});
