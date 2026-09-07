import "server-only";

import { z } from "zod";
import { databaseUrl } from "@basin/domain";
import type { DatabaseHealth } from "@basin/db";
import { address } from "@basin/domain";

import { networkConfig } from "./network";

const httpUrl = (message: string) =>
  z
    .url(message)
    .refine(
      (value) =>
        URL.canParse(value) &&
        ["http:", "https:"].includes(new URL(value).protocol),
      { message },
    );

const environmentSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      databaseUrl.optional(),
    ),
    APP_ENV: z
      .enum(["development", "preview", "production"], {
        error: "Set a supported application environment.",
      })
      .default("development"),
    APP_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      httpUrl("Set a valid canonical application URL.").optional(),
    ),
    SEPOLIA_RPC_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      httpUrl("Set a valid Ethereum Sepolia RPC URL.").optional(),
    ),
    ENSV2_BASIN_REGISTRY_ADDRESS: z.preprocess(
      (value) => (value === "" ? undefined : value),
      address.optional(),
    ),
    ENSV2_REGISTRAR_PRIVATE_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^0x[\da-fA-F]{64}$/)
        .optional(),
    ),
    DEPLOYMENT_REVISION: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1).max(120).optional(),
    ),
  })
  .superRefine((environment, context) => {
    if (environment.APP_ENV !== "development" && !environment.APP_URL) {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "Set a valid canonical application URL.",
      });
    }
  });

const rawEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
  APP_ENV: process.env.APP_ENV,
  APP_URL: process.env.APP_URL,
  SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
  ENSV2_BASIN_REGISTRY_ADDRESS: process.env.ENSV2_BASIN_REGISTRY_ADDRESS,
  ENSV2_REGISTRAR_PRIVATE_KEY: process.env.ENSV2_REGISTRAR_PRIVATE_KEY,
  DEPLOYMENT_REVISION: process.env.DEPLOYMENT_REVISION,
};

export type EnvironmentHealth = {
  status: "ok" | "degraded";
  environment: "development" | "preview" | "production";
  network: {
    name: typeof networkConfig.networkName;
    chainId: typeof networkConfig.chainId;
  };
  checks: {
    database: DatabaseHealth;
    configuration: "ok" | "invalid";
    rpc: "configured" | "not_required";
    identity: "configured" | "not_configured";
  };
  version: string | null;
};

export function getServerEnvironment() {
  const result = environmentSchema.safeParse(rawEnvironment);

  if (!result.success) {
    const messages = [
      ...new Set(result.error.issues.map((issue) => issue.message)),
    ];
    throw new Error(messages.join(" "));
  }

  return result.data;
}

export function getEnvironmentHealth(): EnvironmentHealth {
  const result = environmentSchema.safeParse(rawEnvironment);

  if (!result.success) {
    const supportedEnvironment = z
      .enum(["development", "preview", "production"])
      .safeParse(rawEnvironment.APP_ENV);

    return {
      status: "degraded",
      environment: supportedEnvironment.success
        ? supportedEnvironment.data
        : "development",
      network: {
        name: networkConfig.networkName,
        chainId: networkConfig.chainId,
      },
      checks: {
        database: "unavailable",
        configuration: "invalid",
        rpc: "not_required",
        identity: "not_configured",
      },
      version: null,
    };
  }

  return {
    status: "ok",
    environment: result.data.APP_ENV,
    network: {
      name: networkConfig.networkName,
      chainId: networkConfig.chainId,
    },
    checks: {
      database: "unavailable",
      configuration: "ok",
      rpc: result.data.SEPOLIA_RPC_URL ? "configured" : "not_required",
      identity:
        result.data.SEPOLIA_RPC_URL &&
        result.data.ENSV2_BASIN_REGISTRY_ADDRESS &&
        result.data.ENSV2_REGISTRAR_PRIVATE_KEY
          ? "configured"
          : "not_configured",
    },
    version: result.data.DEPLOYMENT_REVISION ?? null,
  };
}

export function getEnsServerEnvironment() {
  const environment = getServerEnvironment();
  if (
    !environment.SEPOLIA_RPC_URL ||
    !environment.ENSV2_BASIN_REGISTRY_ADDRESS
  ) {
    throw new Error("Basin identity setup is not configured.");
  }
  return {
    rpcUrl: environment.SEPOLIA_RPC_URL,
    basinRegistryAddress:
      environment.ENSV2_BASIN_REGISTRY_ADDRESS as `0x${string}`,
    registrarPrivateKey: environment.ENSV2_REGISTRAR_PRIVATE_KEY as
      `0x${string}` | undefined,
  };
}
