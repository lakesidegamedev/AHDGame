import type { HealPanelResult } from "./useHealPanel";

interface HealPanelActionsProps {
  loading: boolean;
  onDiagnose: () => Promise<void>;
  onHeal: () => Promise<void>;
  diagnosePendingLabel?: string;
  healLabel?: string;
  healPendingLabel?: string;
  healTone?: "error" | "warning";
}

export function HealPanelActions({
  loading,
  onDiagnose,
  onHeal,
  diagnosePendingLabel = "Running...",
  healLabel = "Heal all",
  healPendingLabel = "Healing...",
  healTone = "error",
}: HealPanelActionsProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onDiagnose}
        disabled={loading}
        className="rounded-lg border border-card-border bg-background px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 disabled:opacity-50"
      >
        {loading ? diagnosePendingLabel : "Diagnose"}
      </button>
      <button
        onClick={onHeal}
        disabled={loading}
        className={
          healTone === "warning"
            ? "rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
            : "rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
        }
      >
        {loading ? healPendingLabel : healLabel}
      </button>
    </div>
  );
}

export function HealPanelMessage({ result }: { result: HealPanelResult | null }) {
  return (
    result && (
      <p className={`text-xs font-medium ${result.ok ? "text-success" : "text-error"}`}>
        {result.message}
      </p>
    )
  );
}
