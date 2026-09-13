export function hasConclusiveNonSubmissionEvidence(input: {
  paymentIdConsumed: boolean;
  obligationExists: boolean;
  obligationCancelled: boolean;
  obligationRemainingAmount: bigint;
  paymentAmount: bigint;
}) {
  return (
    !input.paymentIdConsumed &&
    input.obligationExists &&
    !input.obligationCancelled &&
    input.obligationRemainingAmount >= input.paymentAmount
  );
}
