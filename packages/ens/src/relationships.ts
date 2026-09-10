import { getAddress, namehash, type Address } from "viem";

import { createEnsAdapter } from "./adapter";
import type { EnsDeploymentConfig } from "./deployment";
import { EnsProtocolError } from "./errors";
import { normalizeBasinLabel } from "./names";
import { createSettlementAdapter, type RelationshipScope } from "./settlement";

export function normalizeBasinIdentityInput(raw: string) {
  const value = raw.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter a Basin identity, such as name.basin.eth.",
    );
  }
  let label = value;
  if (value.startsWith("basin://")) {
    label = value.slice("basin://".length);
  } else if (value.endsWith(".basin.eth")) {
    label = value.slice(0, -".basin.eth".length);
  }
  if (
    !label ||
    label.includes(".") ||
    /[/?#:@]/.test(label) ||
    value.startsWith("basin:///")
  ) {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter a Basin identity, such as name.basin.eth.",
    );
  }
  try {
    return normalizeBasinLabel(label);
  } catch {
    throw new EnsProtocolError(
      "INVALID_LABEL",
      "Enter a Basin identity, such as name.basin.eth.",
    );
  }
}

export function deriveRelationshipName(
  identityName: string,
  organizationName: string,
) {
  const identity = normalizeBasinIdentityInput(identityName);
  const organization = normalizeBasinLabel(organizationName);
  return `${identity.label}.${organization.label}.basin.eth`;
}

export function createRelationshipReader(config: EnsDeploymentConfig) {
  const identities = createEnsAdapter(config);
  const settlement = createSettlementAdapter(config);
  return {
    async resolveIdentity(name: string, controller: Address) {
      const normalized = normalizeBasinIdentityInput(name);
      const observed = await identities.verifyIdentity(
        normalized.name,
        getAddress(controller),
      );
      return { normalized, observed };
    },
    async observe(scope: RelationshipScope) {
      const state = await settlement.read(scope);
      return {
        ...state,
        relationshipNamehash: namehash(scope.name),
      };
    },
  };
}
