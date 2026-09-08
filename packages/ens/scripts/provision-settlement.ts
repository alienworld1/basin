import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  createEnsAdapter,
  dnsEncodeName,
  ENSV2_SEPOLIA_DEPLOYMENT as deployment,
  ROLE_SET_DATA,
} from "../src/index";
import { factoryAbi, registryAbi, resolverAbi } from "../src/abis";
import { readLiveEnvironment } from "./environment";

async function main() {
  const [identityName, controllerInput] = process.argv.slice(2);
  if (!identityName || !controllerInput) throw new Error();
  const environment = readLiveEnvironment();
  const controller = getAddress(controllerInput);
  await createEnsAdapter(environment).verifyIdentity(identityName, controller);
  const payerKey = process.env.SETTLEMENT_FIXTURE_PAYER_KEY;
  const registrarKey = process.env.ENSV2_REGISTRAR_PRIVATE_KEY;
  if (
    !payerKey ||
    !registrarKey ||
    !/^0x[0-9a-fA-F]{64}$/.test(payerKey) ||
    !/^0x[0-9a-fA-F]{64}$/.test(registrarKey)
  )
    throw new Error();
  const payer = privateKeyToAccount(payerKey as Hex);
  const registrar = privateKeyToAccount(registrarKey as Hex);
  if (
    payer.address === controller ||
    registrar.address === controller ||
    payer.address === registrar.address
  )
    throw new Error();
  const client = createPublicClient({
    chain: sepolia,
    transport: http(environment.rpcUrl, { retryCount: 1 }),
  });
  const wallet = createWalletClient({
    account: payer,
    chain: sepolia,
    transport: http(environment.rpcUrl, { retryCount: 0 }),
  });
  const namespaceWallet = createWalletClient({
    account: registrar,
    chain: sepolia,
    transport: http(environment.rpcUrl, { retryCount: 0 }),
  });
  const organization = `qa-${randomBytes(6).toString("hex")}`;
  const name = `${identityName.split(".")[0]}.${organization}.basin.eth`;
  const transactions: Hex[] = [];
  const wait = async (hash: Hex) => {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 120_000,
    });
    if (receipt.status !== "success") throw new Error();
    transactions.push(hash);
    return receipt;
  };
  async function deploy(implementation: Address, data: Hex) {
    const hash = await wallet.writeContract({
      address: deployment.verifiableFactory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [
        implementation,
        BigInt(`0x${randomBytes(32).toString("hex")}`),
        data,
      ],
    });
    const receipt = await wait(hash);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== deployment.verifiableFactory) continue;
      try {
        const event = decodeEventLog({
          abi: factoryAbi,
          eventName: "ProxyDeployed",
          data: log.data,
          topics: log.topics,
        });
        return event.args.proxyAddress;
      } catch {
        continue;
      }
    }
    throw new Error();
  }
  const bootstrap = ROLE_SET_DATA | (ROLE_SET_DATA << 128n);
  const resolver = await deploy(
    deployment.permissionedResolverImplementation,
    encodeFunctionData({
      abi: resolverAbi,
      functionName: "initialize",
      args: [payer.address, bootstrap, []],
    }),
  );
  await wait(
    await wallet.writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: "multicall",
      args: [
        [
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "authorizeDataRoles",
            args: [dnsEncodeName(name), "basin.settlement", controller, true],
          }),
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "revokeRootRoles",
            args: [bootstrap, payer.address],
          }),
        ],
      ],
    }),
  );
  const lifecycle = 1n | (1n << 12n) | (1n << 16n);
  const parentRoles = (1n << 8n) | (1n << 136n);
  const setupAbi = parseAbi([
    "function initialize(address admin,uint256 roles)",
    "function setParent(address parent,string label)",
    "function revokeRootRoles(uint256 roleBitmap,address account) returns (bool)",
  ]);
  const registry = await deploy(
    deployment.userRegistryImplementation,
    encodeFunctionData({
      abi: setupAbi,
      functionName: "initialize",
      args: [payer.address, lifecycle | (lifecycle << 128n) | parentRoles],
    }),
  );
  await wait(
    await wallet.writeContract({
      address: registry,
      abi: setupAbi,
      functionName: "setParent",
      args: [environment.basinRegistryAddress, organization],
    }),
  );
  await wait(
    await wallet.writeContract({
      address: registry,
      abi: setupAbi,
      functionName: "revokeRootRoles",
      args: [parentRoles, payer.address],
    }),
  );
  const expiry = (await client.getBlock()).timestamp + 86400n * 7n;
  await wait(
    await namespaceWallet.writeContract({
      address: environment.basinRegistryAddress,
      abi: registryAbi,
      functionName: "register",
      args: [organization, payer.address, registry, zeroAddress, 0n, expiry],
    }),
  );
  await wait(
    await wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "register",
      args: [
        identityName.split(".")[0],
        controller,
        zeroAddress,
        resolver,
        0n,
        expiry,
      ],
    }),
  );
  process.stdout.write(
    JSON.stringify({
      name,
      controller,
      payer: payer.address,
      registry,
      resolver,
      deployment: deployment.sourceCommit,
      transactionHashes: transactions,
      applicationApprovalCreated: false,
    }) + "\n",
  );
}
main().catch(() => {
  process.stderr.write(
    "Fixture provisioning did not complete. Check the existing identity, distinct disposable payer, registrar permissions, funding, and RPC. No application records were created.\n",
  );
  process.exitCode = 1;
});
