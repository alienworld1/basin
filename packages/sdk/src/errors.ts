/** Stable errors emitted by the public Basin protocol surface. */
export type BasinSdkErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_NETWORK"
  | "UNSUPPORTED_VERSION"
  | "INVALID_DEPLOYMENT"
  | "NOT_FOUND"
  | "INACTIVE"
  | "REAPPROVAL_REQUIRED"
  | "STALE_PREPARATION"
  | "INVALID_EVIDENCE"
  | "EVIDENCE_UNAVAILABLE"
  | "RPC_UNAVAILABLE"
  | "CONFLICT";

export class BasinSdkError extends Error {
  constructor(
    public readonly code: BasinSdkErrorCode,
    message: string,
    public readonly details?: Readonly<
      Record<string, string | bigint | boolean>
    >,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BasinSdkError";
  }
}

export function sdkError(error: unknown): BasinSdkError {
  if (error instanceof BasinSdkError) return error;
  return new BasinSdkError(
    "RPC_UNAVAILABLE",
    "Basin protocol evidence is unavailable.",
    undefined,
    { cause: error },
  );
}
