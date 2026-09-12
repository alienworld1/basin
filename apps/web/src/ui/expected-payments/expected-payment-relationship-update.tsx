import { Button } from "../button";

export function ExpectedPaymentRelationshipUpdate({
  payeeName,
  previousGenerationLabel,
  currentGenerationLabel,
  canAdopt,
  busy,
  onAdopt,
}: {
  payeeName: string;
  previousGenerationLabel: string;
  currentGenerationLabel: string;
  canAdopt: boolean;
  busy: boolean;
  onAdopt: () => void;
}) {
  return (
    <section
      className="border-l-2 border-state-warning pl-4"
      aria-labelledby="relationship-update-heading"
    >
      <h3 id="relationship-update-heading" className="font-medium text-ink">
        Review the current relationship
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        This payment was recorded under {previousGenerationLabel}. {payeeName}
        now uses {currentGenerationLabel}, which your organization has already
        approved. Receiving details remain under the payee&apos;s control.
      </p>
      {canAdopt ? (
        <Button className="mt-4" disabled={busy} onClick={onAdopt}>
          {busy ? "Updating payment…" : "Use current relationship"}
        </Button>
      ) : (
        <p className="mt-3 text-sm text-ink-secondary">
          Ask an organization administrator to update this expected payment.
        </p>
      )}
    </section>
  );
}
