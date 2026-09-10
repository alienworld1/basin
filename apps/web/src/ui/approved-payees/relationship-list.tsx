import type { ApprovedPayeeRowDto } from "../../shared/approved-payee-types";

export function RelationshipList({
  rows,
  onSelect,
}: {
  rows: ApprovedPayeeRowDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="mt-5 divide-y divide-line border-y border-line">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className="focus-ring grid min-h-20 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-4 py-4 text-left"
            onClick={() => onSelect(row.id)}
          >
            <span className="min-w-0">
              <span className="block wrap-anywhere font-medium">
                {row.payeeDisplayName ?? row.payeeName}
              </span>
              <span className="mt-1 block wrap-anywhere text-sm text-ink-secondary">
                {row.payeeName}
              </span>
              {row.relationshipName ? (
                <span className="mt-1 block wrap-anywhere text-xs text-ink-tertiary">
                  Relationship · {row.relationshipName}
                </span>
              ) : null}
            </span>
            <span className="text-right">
              <span className="block text-sm font-medium">
                {row.statusLabel}
              </span>
              <span className="mt-1 block text-xs text-ink-tertiary">
                {row.receivingStatus === "READY"
                  ? "Receiving verified"
                  : "Receiving setup needed"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
