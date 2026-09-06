export type EnsErrorCode =
  | "INVALID_LABEL"
  | "RESERVED_LABEL"
  | "COLLISION"
  | "PENDING"
  | "NEEDS_REVIEW"
  | "PERSISTENCE"
  | "CONFIGURATION"
  | "RPC_UNAVAILABLE"
  | "TRANSACTION_REVERTED";

export class EnsProtocolError extends Error {
  constructor(
    public readonly code: EnsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnsProtocolError";
  }
}
