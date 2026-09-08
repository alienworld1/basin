import "server-only";
import { z } from "zod";
import { basinRouterManifest } from "../config/basin-router-manifest";

const encryptionKey = z.string().regex(/^[0-9a-fA-F]{64}$/);

export function treasuryConfiguration() {
  const secret = z
    .object({
      key: encryptionKey,
      version: z.string().trim().min(1).max(64),
    })
    .safeParse({
      key: process.env.TREASURY_ROUTINE_KEY_ENCRYPTION_KEY,
      version: process.env.TREASURY_ROUTINE_KEY_VERSION,
    });
  if (!secret.success) {
    throw new Error("Organization treasury setup is not configured.");
  }
  return {
    chainId: 11155111 as const,
    network: "Ethereum Sepolia" as const,
    signerSecret: {
      key: Buffer.from(secret.data.key, "hex"),
      version: secret.data.version,
    },
    router: basinRouterManifest
      ? {
          address: basinRouterManifest.address,
          version: basinRouterManifest.version,
          limit: basinRouterManifest.routinePerTransactionLimitBaseUnits,
          abi: basinRouterManifest.abi,
        }
      : null,
  };
}

export function treasuryRouterConfigured() {
  return Boolean(basinRouterManifest);
}

export const configuredRoutineLimit = () =>
  basinRouterManifest?.routinePerTransactionLimitBaseUnits;
