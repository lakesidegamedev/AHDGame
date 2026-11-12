"use client";

/** Propose-no-confidence button with an inline confirm step and cooldown lockout. */
export function NoConfidenceProposeControl({
  cooldownTurns,
  showCooldownTitle = false,
  confirmOpen,
  onConfirmOpenChange,
  proposing,
  canPropose,
  onPropose,
}: {
  cooldownTurns: number | null | undefined;
  /** Explain the remaining cooldown in the disabled button's tooltip. */
  showCooldownTitle?: boolean;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  proposing: boolean;
  canPropose: boolean;
  onPropose: () => void;
}) {
  if (cooldownTurns && cooldownTurns > 0) {
    return (
      <button
        disabled
        title={
          showCooldownTitle
            ? `No-confidence cooldown: ${cooldownTurns} turn${cooldownTurns === 1 ? "" : "s"} remaining`
            : undefined
        }
        className="shrink-0 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2 text-sm font-semibold text-warning/40 cursor-not-allowed opacity-50"
      >
        Propose no-confidence
      </button>
    );
  }
  if (confirmOpen) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-warning">Are you sure?</span>
        <button
          onClick={onPropose}
          disabled={proposing || !canPropose}
          className="rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-black hover:bg-warning/90 disabled:opacity-50 transition-colors"
        >
          {proposing ? "Proposing…" : "Confirm"}
        </button>
        <button
          onClick={() => onConfirmOpenChange(false)}
          className="rounded-lg border border-card-border px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => onConfirmOpenChange(true)}
      disabled={!canPropose}
      className="shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning hover:bg-warning/20 disabled:opacity-50 transition-colors"
    >
      Propose no-confidence
    </button>
  );
}
