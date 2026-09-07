export type PendingIdentityClaim = {
  version: 1;
  workspaceId: string;
  name: string;
  transactionHash?: string;
  createdAt: string;
};

export function pendingClaimKey(userId: string, workspaceId: string) {
  return `basin.pending-identity.v1:${userId}:${workspaceId}`;
}

export function readPendingClaim(
  userId: string,
  workspaceId: string,
): PendingIdentityClaim | null {
  const key = pendingClaimKey(userId, workspaceId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingIdentityClaim>;
    const valid =
      value.version === 1 &&
      value.workspaceId === workspaceId &&
      typeof value.name === "string" &&
      value.name.endsWith(".basin.eth") &&
      typeof value.createdAt === "string" &&
      Date.now() - Date.parse(value.createdAt) < 7 * 24 * 60 * 60 * 1000 &&
      (value.transactionHash === undefined ||
        /^0x[\da-fA-F]{64}$/.test(value.transactionHash));
    if (!valid) {
      localStorage.removeItem(key);
      return null;
    }
    return value as PendingIdentityClaim;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function writePendingClaim(userId: string, claim: PendingIdentityClaim) {
  localStorage.setItem(
    pendingClaimKey(userId, claim.workspaceId),
    JSON.stringify(claim),
  );
}

export function clearPendingClaim(userId: string, workspaceId: string) {
  localStorage.removeItem(pendingClaimKey(userId, workspaceId));
}
