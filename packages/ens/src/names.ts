import { ens_normalize as normalize } from "@adraffy/ens-normalize";
import { keccak256, namehash, stringToHex } from "viem";

import { EnsProtocolError } from "./errors";

export const BASIN_NAMESPACE = "basin.eth";

export const reservedLabels = new Set([
  "basin",
  "www",
  "app",
  "api",
  "admin",
  "support",
  "help",
  "docs",
  "status",
  "payments",
  "pay",
  "system",
  "root",
]);

export type BasinName = {
  label: string;
  name: string;
  labelhash: `0x${string}`;
  namehash: `0x${string}`;
};

export function normalizeBasinLabel(raw: string): BasinName {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new EnsProtocolError("INVALID_LABEL", "Enter a Basin identity.");
  }
  if (trimmed.toLowerCase().endsWith(".basin.eth")) {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter only the name before .basin.eth.",
    );
  }
  if (trimmed.includes(".")) {
    throw new EnsProtocolError("INVALID_LABEL", "Enter one name without dots.");
  }
  let label: string;
  try {
    label = normalize(trimmed);
  } catch {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter a valid Basin identity.",
    );
  }
  const encodedLength = new TextEncoder().encode(label).length;
  if (!label || encodedLength > 255) {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter a valid Basin identity.",
    );
  }
  if (reservedLabels.has(label)) {
    throw new EnsProtocolError(
      "RESERVED_LABEL",
      "That name is reserved by Basin.",
    );
  }
  const name = `${label}.${BASIN_NAMESPACE}`;
  return {
    label,
    name,
    labelhash: keccak256(stringToHex(label)),
    namehash: namehash(name),
  };
}
