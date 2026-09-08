import { createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  createSettlementAdapter,
  descriptorRecord,
  ENSV2_SEPOLIA_DEPLOYMENT,
  receivingAddress,
} from "../src/index";
import { readLiveEnvironment } from "./environment";

async function main() {
  const [name, expectedController] = process.argv.slice(2);
  if (!name || !expectedController || !name.split(".")[1]?.startsWith("qa-"))
    throw new Error(
      "Pass an isolated alice.qa-…basin.eth relationship and its expected controller.",
    );
  const environment = readLiveEnvironment();
  const key = process.env.SETTLEMENT_FIXTURE_CONTROLLER_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("Set the disposable fixture controller key.");
  const account = privateKeyToAccount(key as `0x${string}`);
  if (account.address !== getAddress(expectedController))
    throw new Error("Fixture key does not match the expected controller.");
  const asset = receivingAddress(process.env.SETTLEMENT_ASSET_ADDRESS ?? "");
  const destinations = [
    receivingAddress(process.env.SETTLEMENT_FIXTURE_DESTINATION_A ?? ""),
    receivingAddress(process.env.SETTLEMENT_FIXTURE_DESTINATION_B ?? ""),
  ];
  if (destinations[0] === destinations[1])
    throw new Error("Use two distinct receiving accounts.");
  const adapter = createSettlementAdapter(environment);
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(environment.rpcUrl, { retryCount: 0 }),
  });
  const scope = {
    name,
    identityName: `${name.split(".")[0]}.basin.eth`,
    controller: account.address,
    identityEpoch: 0n,
  };
  const before = await adapter.read(scope);
  if (before.record !== "0x")
    throw new Error(
      "This fixture already has a record. Use a fresh isolated relationship.",
    );
  let known = null;
  for (const destination of destinations) {
    const prepared = await adapter.prepare(scope, asset, destination, known);
    await adapter.revalidate(prepared);
    const hash = await wallet.sendTransaction({
      to: prepared.transaction.to,
      data: prepared.transaction.data,
      value: 0n,
    });
    await adapter.client.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 120_000,
    });
    const verified = await adapter.verify(prepared, hash);
    if (
      verified.current.tokenId !== before.tokenId ||
      verified.current.identityEpoch !== before.identityEpoch
    )
      throw new Error("Fixture authority changed.");
    known = { record: descriptorRecord(prepared.descriptor), destination };
    process.stdout.write(
      JSON.stringify({
        deployment: ENSV2_SEPOLIA_DEPLOYMENT.sourceCommit,
        name,
        controller: account.address,
        tokenId: before.tokenId.toString(),
        epoch: prepared.descriptor.settlementEpoch.toString(),
        commitment: verified.current.decoded!.commitment,
        transactionHash: hash,
        blockNumber: verified.receiptBlock.toString(),
        blockHash: verified.receiptBlockHash,
      }) + "\n",
    );
  }
}
main().catch(() => {
  process.stderr.write(
    "Settlement fixture exercise did not complete. Check the isolated relationship, disposable controller, funding, and environment. No application approval was created.\n",
  );
  process.exitCode = 1;
});
