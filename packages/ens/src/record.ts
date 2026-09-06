import { decodeAbiParameters, encodeAbiParameters, size } from "viem";

import { EnsProtocolError } from "./errors";

export const BASIN_IDENTITY_RECORD_KEY = "basin.identity";

export type BasinIdentityRecordV1 = {
  version: 1;
  payeeId: `0x${string}`;
  identityEpoch: bigint;
};

const recordParameters = [
  { name: "version", type: "uint8" },
  { name: "payeeId", type: "bytes32" },
  { name: "identityEpoch", type: "uint256" },
] as const;

export function encodeIdentityRecordV1(
  payeeId: `0x${string}`,
  identityEpoch = 0n,
) {
  return encodeAbiParameters(recordParameters, [1, payeeId, identityEpoch]);
}

export function decodeIdentityRecordV1(value: `0x${string}`) {
  if (size(value) !== 96) {
    throw new EnsProtocolError(
      "NEEDS_REVIEW",
      "The Basin identity record has an unexpected shape.",
    );
  }
  try {
    const [version, payeeId, identityEpoch] = decodeAbiParameters(
      recordParameters,
      value,
    );
    if (version !== 1) throw new Error("Unsupported version");
    return { version, payeeId, identityEpoch } satisfies BasinIdentityRecordV1;
  } catch {
    throw new EnsProtocolError(
      "NEEDS_REVIEW",
      "The Basin identity record is not supported.",
    );
  }
}
