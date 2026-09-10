import { z } from "zod";
import { getAddress } from "@ethersproject/address";
import { ens_normalize as normalize } from "@adraffy/ens-normalize";
import { DomainError } from "./lifecycle";

export const limits = {
  displayName: 120,
  purpose: 240,
  externalReference: 160,
} as const;
export const recordId = z
  .bigint()
  .positive()
  .max(BigInt("9223372036854775807"));
export const chainInteger = z
  .union([z.string().regex(/^\d{1,78}$/), z.bigint().nonnegative()])
  .transform(String)
  .refine((value) => value.length <= 78)
  .transform((value) => BigInt(value).toString());
export const amount = chainInteger.refine(
  (value) => BigInt(value) > BigInt(0),
  "Enter an amount greater than zero.",
);
export const address = z
  .string()
  .refine((value) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return false;
    try {
      getAddress(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid address evidence.")
  .transform((value) => value.toLowerCase());
export const hash = z
  .string()
  .regex(/^0x[\da-fA-F]{64}$/)
  .transform((value) => value.toLowerCase());
export const signature = z
  .string()
  .regex(/^0x(?:[\da-fA-F]{128}|[\da-fA-F]{130})$/)
  .transform((value) => value.toLowerCase());
// Use ENSIP-15 from the maintained ENS utility; protocol registration remains the adapter's responsibility.
export const ensName = z
  .string()
  .min(1)
  .max(255)
  .transform((value, context) => {
    try {
      return normalize(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Basin identity.",
      });
      return z.NEVER;
    }
  });
export const displayName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(limits.displayName);
export const purpose = z
  .string()
  .trim()
  .min(1, "Enter what this payment is for.")
  .max(limits.purpose);
export const externalReference = z
  .string()
  .trim()
  .max(limits.externalReference);

const usdcDecimalPattern = /^\d+(?:\.\d{1,6})?$/;

export function parseUsdcAmount(value: string) {
  if (!usdcDecimalPattern.test(value)) {
    throw new DomainError(
      "INVALID_INPUT",
      "Enter a valid USDC amount with up to 6 decimal places.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const baseUnits =
    BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (baseUnits === 0n) {
    throw new DomainError(
      "INVALID_INPUT",
      "Enter an amount greater than zero.",
    );
  }
  if (baseUnits > BigInt("9".repeat(78))) {
    throw new DomainError(
      "INVALID_INPUT",
      "Enter a valid USDC amount with up to 6 decimal places.",
    );
  }
  return baseUnits.toString();
}

export function formatUsdcBaseUnits(value: string) {
  const units = BigInt(value);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
export const databaseUrl = z
  .string({ error: "Set a valid database connection." })
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        Boolean(url.hostname && url.pathname.length > 1)
      );
    } catch {
      return false;
    }
  }, "Set a valid database connection.");
