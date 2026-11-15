import type { ExecutiveStatusPayload } from "@/lib/elections/rules/successionFill";

const STAGE_LABEL = {
  acting: "Acting leadership",
  awaiting_fill: "Awaiting a successor",
  overdue: "Succession overdue",
} as const;

/** Caretaker and succession state for a presidential hub; renders nothing when both are clear. */
export function ExecutiveStatusBanner({ status }: { status: ExecutiveStatusPayload | undefined }) {
  if (!status || (!status.succession && !status.caretaker)) return null;
  return (
    <div
      data-testid="executive-status-banner"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1"
    >
      {status.succession && (
        <p className="text-sm text-foreground">
          <strong>{STAGE_LABEL[status.succession.stage]}:</strong> {status.succession.summary}
        </p>
      )}
      {status.succession?.note && <p className="text-sm text-muted">{status.succession.note}</p>}
      {status.caretaker && (
        <p className="text-sm text-foreground">
          <strong>Caretaker government:</strong> limited powers until a new government forms.
        </p>
      )}
    </div>
  );
}
