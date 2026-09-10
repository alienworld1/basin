import "server-only";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  PrivyAPIError,
  type Policy,
  PrivyClient,
  RateLimitError,
} from "@privy-io/node";
import type { RoutinePolicyDefinition } from "./policy";

export type QuorumEvidence = {
  id: string;
  threshold: number;
  userIds: string[];
  publicKeys: string[];
};
export type OrganizationEvidence = { id: string; defaultQuorumId: string };
export type WalletEvidence = {
  id: string;
  address: string;
  chainType: string;
  ownerId: string | null;
  additionalSigners: { signerId: string; policyIds: string[] }[];
  policyIds: string[];
  entityId?: string;
};
export type PolicyEvidence = {
  id: string;
  ownerId: string | null;
  fingerprint: string;
};
export type IntentEvidence = {
  id: string;
  status:
    "pending" | "executed" | "failed" | "expired" | "rejected" | "dismissed";
  expiresAt?: Date;
};

export type HighAuthorityAuthorizationRequest = {
  requestExpiry: number;
  request: {
    version: 1;
    method: "POST";
    url: string;
    body: Record<string, unknown>;
    headers: {
      "privy-app-id": string;
      "privy-idempotency-key": string;
      "privy-request-expiry": string;
    };
  };
};

export class TreasuryAuthorizationRequired extends Error {
  constructor(readonly authorization: HighAuthorityAuthorizationRequest) {
    super("AUTHORIZATION_REQUIRED");
  }
}

export class TreasuryProviderError extends Error {
  constructor(
    readonly code:
      | "PRIVY_UNAVAILABLE"
      | "RATE_LIMITED"
      | "CONFIGURATION_MISMATCH"
      | "AUTHORIZATION_REQUIRED"
      | "INSUFFICIENT_FUNDS"
      | "TRANSACTION_REJECTED"
      | "UNKNOWN_EXTERNAL_STATE",
    readonly diagnostic?: string,
  ) {
    super(code);
  }
}

function providerDiagnostic(error: unknown, stage?: string) {
  const prefix = stage ? `${stage}_` : "";
  if (error instanceof APIError) {
    const body = error.error as Record<string, unknown> | undefined;
    const rawCode = [
      body?.code,
      body?.error_code,
      body?.type,
      body?.error,
    ].find((value): value is string => typeof value === "string");
    const code = rawCode
      ?.toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    const message =
      typeof body?.message === "string"
        ? body.message
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 120)
        : undefined;
    return `${prefix}PRIVY_API_${error.status ?? "UNKNOWN"}${code ? `_${code}` : ""}${message ? `_${message}` : ""}`;
  }
  if (error instanceof Error) {
    const name = error.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .slice(0, 40);
    return `${prefix}PRIVY_CLIENT_${name || "ERROR"}`;
  }
  return `${prefix}PRIVY_CLIENT_UNKNOWN`;
}

export interface PrivyTreasuryAdapter {
  createOwnerQuorum(input: {
    userId: string;
    name: string;
    idempotencyKey: string;
  }): Promise<QuorumEvidence>;
  getQuorum(id: string): Promise<QuorumEvidence>;
  createOrganization(input: {
    quorumId: string;
    name: string;
    idempotencyKey: string;
  }): Promise<OrganizationEvidence>;
  getOrganization(id: string): Promise<OrganizationEvidence>;
  createRoutineSigner(input: {
    publicKey: string;
    name: string;
    idempotencyKey: string;
  }): Promise<QuorumEvidence>;
  createPolicy(input: {
    definition: RoutinePolicyDefinition;
    idempotencyKey: string;
  }): Promise<PolicyEvidence>;
  getPolicy(
    id: string,
    expectedFingerprint: (value: Policy) => string,
  ): Promise<PolicyEvidence>;
  createWallet(input: {
    organizationId: string;
    ownerId: string;
    routineSignerId: string;
    routinePolicyId?: string;
    name: string;
    externalId: string;
    idempotencyKey: string;
  }): Promise<WalletEvidence>;
  getWallet(id: string): Promise<WalletEvidence>;
  createWalletUpdateIntent(input: {
    walletId: string;
    routineSignerId: string;
    routinePolicyId: string;
    idempotencyKey: string;
  }): Promise<IntentEvidence>;
  getIntent(id: string): Promise<IntentEvidence>;
  sendHighAuthorityTransaction?(input: {
    walletId: string;
    to: string;
    data: string;
    idempotencyKey: string;
    authorizationSignature?: string;
    requestExpiry?: number;
  }): Promise<{ hash: string; transactionId?: string }>;
}

const mapQuorum = (value: {
  id: string;
  authorization_threshold: number | null;
  user_ids: string[] | null;
  authorization_keys: { public_key: string }[];
}): QuorumEvidence => ({
  id: value.id,
  threshold: value.authorization_threshold ?? 0,
  userIds: value.user_ids ?? [],
  publicKeys: value.authorization_keys.map((key) => key.public_key),
});

const mapWallet = (wallet: {
  id: string;
  address: string;
  chain_type: string;
  owner_id: string | null;
  additional_signers?: { signer_id: string; override_policy_ids?: string[] }[];
  policy_ids?: string[];
  entity?: { id: string } | null;
}): WalletEvidence => ({
  id: wallet.id,
  address: wallet.address.toLowerCase(),
  chainType: wallet.chain_type,
  ownerId: wallet.owner_id,
  additionalSigners: (wallet.additional_signers ?? []).map((signer) => ({
    signerId: signer.signer_id,
    policyIds: signer.override_policy_ids ?? [],
  })),
  policyIds: wallet.policy_ids ?? [],
  entityId: wallet.entity?.id,
});

function rethrow(error: unknown, stage?: string): never {
  const diagnostic = providerDiagnostic(error, stage);
  if (error instanceof RateLimitError)
    throw new TreasuryProviderError("RATE_LIMITED", diagnostic);
  if (
    error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError
  )
    throw new TreasuryProviderError("PRIVY_UNAVAILABLE", diagnostic);
  const providerError =
    error instanceof PrivyAPIError
      ? `${error.message} ${error instanceof APIError ? JSON.stringify(error.error) : ""}`.toLowerCase()
      : "";
  if (
    providerError.includes("insufficient funds") ||
    providerError.includes("insufficient_funds") ||
    providerError.includes("insufficient balance")
  ) {
    throw new TreasuryProviderError("INSUFFICIENT_FUNDS", diagnostic);
  }
  if (
    providerError.includes("revert") ||
    providerError.includes("failed to estimate") ||
    providerError.includes("transaction rejected")
  ) {
    throw new TreasuryProviderError("TRANSACTION_REJECTED", diagnostic);
  }
  if (
    (error instanceof APIError && [401, 403].includes(error.status)) ||
    providerError.includes("authorization") ||
    providerError.includes("signature") ||
    providerError.includes("user jwt") ||
    providerError.includes("user key") ||
    providerError.includes("quorum") ||
    providerError.includes("owner")
  ) {
    throw new TreasuryProviderError("AUTHORIZATION_REQUIRED", diagnostic);
  }
  if (error instanceof APIError && error.status === 404)
    throw new TreasuryProviderError("CONFIGURATION_MISMATCH", diagnostic);
  throw new TreasuryProviderError("UNKNOWN_EXTERNAL_STATE", diagnostic);
}

export function createPrivyTreasuryAdapter(): PrivyTreasuryAdapter {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret)
    throw new TreasuryProviderError("PRIVY_UNAVAILABLE");
  const client = new PrivyClient({ appId, appSecret });
  return {
    async createOwnerQuorum(input) {
      try {
        return mapQuorum(
          await client.keyQuorums().create(
            {
              display_name: input.name,
              authorization_threshold: 1,
              user_ids: [input.userId],
            },
            { idempotencyKey: input.idempotencyKey },
          ),
        );
      } catch (error) {
        rethrow(error);
      }
    },
    async getQuorum(id) {
      try {
        return mapQuorum(await client.keyQuorums().get(id));
      } catch (error) {
        rethrow(error);
      }
    },
    async createOrganization(input) {
      try {
        const value = await client.organizations().create(
          {
            default_key_quorum_id: input.quorumId,
            display_name: input.name,
          },
          { idempotencyKey: input.idempotencyKey },
        );
        return { id: value.id, defaultQuorumId: value.default_key_quorum_id };
      } catch (error) {
        rethrow(error);
      }
    },
    async getOrganization(id) {
      try {
        const value = await client.organizations().get(id);
        return { id: value.id, defaultQuorumId: value.default_key_quorum_id };
      } catch (error) {
        rethrow(error);
      }
    },
    async createRoutineSigner(input) {
      try {
        return mapQuorum(
          await client.keyQuorums().create(
            {
              display_name: input.name,
              authorization_threshold: 1,
              public_keys: [input.publicKey],
            },
            { idempotencyKey: input.idempotencyKey },
          ),
        );
      } catch (error) {
        rethrow(error);
      }
    },
    async createPolicy(input) {
      try {
        const value = await client.policies().create({
          ...input.definition,
          idempotency_key: input.idempotencyKey,
        });
        return { id: value.id, ownerId: value.owner_id, fingerprint: "" };
      } catch (error) {
        rethrow(error);
      }
    },
    async getPolicy(id, expectedFingerprint) {
      try {
        const value = await client.policies().get(id);
        return {
          id: value.id,
          ownerId: value.owner_id,
          fingerprint: expectedFingerprint(value),
        };
      } catch (error) {
        rethrow(error);
      }
    },
    async createWallet(input) {
      try {
        return mapWallet(
          await client.wallets().create({
            chain_type: "ethereum",
            display_name: input.name,
            external_id: input.externalId,
            entity: { id: input.organizationId, type: "organization" },
            owner_id: input.ownerId,
            additional_signers: [
              {
                signer_id: input.routineSignerId,
                ...(input.routinePolicyId
                  ? { override_policy_ids: [input.routinePolicyId] }
                  : {}),
              },
            ],
            idempotency_key: input.idempotencyKey,
          }),
        );
      } catch (error) {
        rethrow(error);
      }
    },
    async getWallet(id) {
      try {
        return mapWallet(await client.wallets().get(id));
      } catch (error) {
        rethrow(error);
      }
    },
    async createWalletUpdateIntent(input) {
      try {
        for await (const existing of client.intents().list({
          resource_id: input.walletId,
          sort_by: "updated_at_desc",
        })) {
          if (
            existing.intent_type === "WALLET" &&
            ["pending", "processing"].includes(existing.status) &&
            existing.request_details.body.additional_signers?.some(
              (signer) =>
                signer.signer_id === input.routineSignerId &&
                signer.override_policy_ids?.[0] === input.routinePolicyId,
            )
          ) {
            return {
              id: existing.intent_id,
              status: "pending",
              expiresAt: new Date(existing.expires_at),
            };
          }
        }
        const value = await client.intents().updateWallet(input.walletId, {
          additional_signers: [
            {
              signer_id: input.routineSignerId,
              override_policy_ids: [input.routinePolicyId],
            },
          ],
        });
        return {
          id: value.intent_id,
          status: value.status === "processing" ? "pending" : value.status,
          expiresAt: new Date(value.expires_at),
        };
      } catch (error) {
        rethrow(error);
      }
    },
    async getIntent(id) {
      try {
        const value = await client.intents().get(id);
        return {
          id: value.intent_id,
          status: value.status === "processing" ? "pending" : value.status,
          expiresAt: new Date(value.expires_at),
        };
      } catch (error) {
        rethrow(error);
      }
    },
    async sendHighAuthorityTransaction(input) {
      const body = {
        caip2: "eip155:11155111" as const,
        params: {
          transaction: {
            to: input.to,
            data: input.data,
            value: "0x0",
            chain_id: 11_155_111,
          },
        },
        method: "eth_sendTransaction" as const,
        chain_type: "ethereum" as const,
      };
      if (!input.authorizationSignature) {
        const requestExpiry = Date.now() + 15 * 60 * 1000;
        const apiUrl = (
          process.env.PRIVY_API_BASE_URL ?? "https://api.privy.io"
        ).replace(/\/$/, "");
        throw new TreasuryAuthorizationRequired({
          requestExpiry,
          request: {
            version: 1,
            method: "POST",
            url: `${apiUrl}/v1/wallets/${encodeURIComponent(input.walletId)}/rpc`,
            body,
            headers: {
              "privy-app-id": appId,
              "privy-idempotency-key": input.idempotencyKey,
              "privy-request-expiry": String(requestExpiry),
            },
          },
        });
      }
      if (!input.requestExpiry || input.requestExpiry <= Date.now()) {
        throw new TreasuryProviderError("AUTHORIZATION_REQUIRED");
      }
      try {
        const value = await client
          .wallets()
          .ethereum()
          .sendTransaction(input.walletId, {
            caip2: body.caip2,
            params: body.params,
            authorization_context: {
              signatures: [input.authorizationSignature],
            },
            idempotency_key: input.idempotencyKey,
            request_expiry: input.requestExpiry,
          });
        return {
          hash: value.hash,
          ...(value.transaction_id
            ? { transactionId: value.transaction_id }
            : {}),
        };
      } catch (error) {
        rethrow(error, "PRIVY_WALLET_RPC");
      }
    },
  };
}
