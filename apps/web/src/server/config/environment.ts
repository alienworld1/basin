import "server-only";

import { z } from "zod";
import { databaseUrl } from "@basin/domain";
import type { DatabaseHealth } from "@basin/db";

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
    },
    version: result.data.DEPLOYMENT_REVISION ?? null,
  };
}
