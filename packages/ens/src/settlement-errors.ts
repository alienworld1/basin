export type SettlementErrorCode =
  | "INVALID_INPUT"
  | "STALE"
  | "NEEDS_REVIEW"
  | "REAPPROVAL_REQUIRED"
  | "RELATIONSHIP_INACTIVE"
  | "UNVERIFIED"
  | "PENDING"
  | "REVERTED";
const messages: Record<SettlementErrorCode, string> = {
  INVALID_INPUT: "Check the receiving details and try again.",
  STALE:
    "Receiving details changed. Review the latest account before continuing.",
  NEEDS_REVIEW: "Receiving details need review.",
  REAPPROVAL_REQUIRED:
    "This relationship needs acceptance before receiving can be changed.",
  RELATIONSHIP_INACTIVE:
    "This relationship isn't active. Changing receiving details can't reactivate it.",
  UNVERIFIED:
    "We couldn't verify who can change these receiving details. Check again.",
  PENDING:
    "We couldn't confirm the result yet. Check again before trying another change.",
  REVERTED:
    "The transaction reverted. Check the current receiving details before trying again.",
};
export class SettlementError extends Error {
  constructor(
    public readonly code: SettlementErrorCode,
    message = messages[code],
  ) {
    super(message);
  }
}
export function requireSettlement(
  condition: unknown,
  code: SettlementErrorCode = "NEEDS_REVIEW",
): asserts condition {
  if (!condition) throw new SettlementError(code);
}
