import { DomainError } from "@basin/domain";
import { ZodError } from "zod";

export async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof ZodError)
      throw new DomainError(
        "INVALID_INPUT",
        "Check the details and try again.",
      );
    const source = error instanceof Error && error.cause ? error.cause : error;
    const code =
      source && typeof source === "object" && "code" in source
        ? source.code
        : undefined;
    if (code === "23505")
      throw new DomainError("CONFLICT", "This record already exists.");
    if (
      ["23503", "23514", "23502", "22003", "22001", "22P02"].includes(
        String(code),
      )
    )
      throw new DomainError("INVALID_INPUT");
    if (code === "40001" || code === "40P01")
      throw new DomainError(
        "CONFLICT",
        "This record has changed. Refresh and try again.",
      );
    throw new DomainError(
      "UNAVAILABLE",
      "We couldn't reach the database. Try again shortly.",
    );
  }
}
export function found<T>(row: T | undefined): T {
  if (!row)
    throw new DomainError(
      "NOT_FOUND",
      "We couldn't find that record in this workspace.",
    );
  return row;
}
export function requireMatch(condition: unknown) {
  if (!condition)
    throw new DomainError(
      "INVALID_INPUT",
      "The evidence does not match this record.",
    );
}
