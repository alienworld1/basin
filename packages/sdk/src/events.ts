import { basinRouterAbi } from "@basin/contracts";
import { decodeEventLog, type Address, type Hex, type Log } from "viem";
import { BASIN_SEPOLIA_V1 } from "./deployment";
import { BasinSdkError } from "./errors";

export type BasinEvent = Readonly<{
  name: "ObligationCreated" | "ObligationExecuted";
  args: Readonly<Record<string, string | bigint | undefined>>;
  transactionHash?: Hex;
  logIndex?: number;
}>;
/** Decodes only supported v1 Router events and rejects evidence from another Router. */
export function decodeBasinEvent(
  log: Pick<
    Log,
    "address" | "topics" | "data" | "transactionHash" | "logIndex"
  >,
  router: Address = BASIN_SEPOLIA_V1.router,
): BasinEvent {
  if (log.address.toLowerCase() !== router.toLowerCase())
    throw new BasinSdkError(
      "INVALID_EVIDENCE",
      "The event was not emitted by the configured Basin Router.",
    );
  try {
    const decoded = decodeEventLog({
      abi: basinRouterAbi,
      data: log.data,
      topics: log.topics,
      strict: true,
    });
    if (
      decoded.eventName !== "ObligationCreated" &&
      decoded.eventName !== "ObligationExecuted"
    )
      throw new Error("unsupported event");
    return {
      name: decoded.eventName,
      args: decoded.args as Readonly<
        Record<string, string | bigint | undefined>
      >,
      transactionHash: log.transactionHash ?? undefined,
      logIndex: log.logIndex ?? undefined,
    };
  } catch (cause) {
    throw new BasinSdkError(
      "INVALID_EVIDENCE",
      "The Router event has an unsupported v1 layout.",
      undefined,
      { cause },
    );
  }
}
