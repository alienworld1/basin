export const UNKNOWN_PAYMENT_SUBMISSION_GRACE_MS = 2 * 60 * 1000;

export const PAYMENT_RECONCILIATION_INITIAL_DELAY_MS = 3_000;
export const PAYMENT_RECONCILIATION_INTERVAL_MS = 5_000;
export const PAYMENT_RECONCILIATION_RETRY_INTERVAL_MS = 10_000;

// Keep checking beyond the server's uncertainty window so at least one poll
// can conclusively distinguish a delayed submission from one that never landed.
export const PAYMENT_RECONCILIATION_POLL_WINDOW_MS =
  UNKNOWN_PAYMENT_SUBMISSION_GRACE_MS + 30_000;

export function shouldContinuePaymentReconciliation(
  startedAt: number,
  now = Date.now(),
) {
  return now - startedAt < PAYMENT_RECONCILIATION_POLL_WINDOW_MS;
}
