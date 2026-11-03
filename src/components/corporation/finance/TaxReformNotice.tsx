import {
  PASS_THROUGH_PHASE_IN_TURNS,
  passThroughReformPhase,
} from "@/lib/corporations/rules/passThroughTax";
import type { CorporationDetail } from "../CorporationPageTypes";

export function TaxReformNotice({
  corporation,
}: {
  corporation: Pick<CorporationDetail, "currentTurn" | "passThroughTaxStartTurn">;
}) {
  const start = corporation.passThroughTaxStartTurn;
  if (start == null || !Number.isSafeInteger(start)) return null;
  const phase = passThroughReformPhase(corporation.currentTurn, start);
  if (phase >= 1) return null;
  const fullTurn = start + PASS_THROUGH_PHASE_IN_TURNS - 1;
  return (
    <aside
      className="rounded-lg border border-warning/30 bg-warning/5 p-4"
      aria-label="Tax reform phase-in"
    >
      <p className="text-sm font-semibold">Tax reform {phase > 0 ? "phasing in" : "scheduled"}</p>
      <p className="mt-1 text-sm text-muted">
        {phase > 0
          ? `Currently applying ${(phase * 100).toFixed(2)}% of the full tax liability.`
          : `Begins on turn ${start}.`}{" "}
        The share of full liability applied increases by 1/{PASS_THROUGH_PHASE_IN_TURNS}{" "}
        (approximately {(100 / PASS_THROUGH_PHASE_IN_TURNS).toFixed(2)} percentage points) each
        turn, reaching 100% on turn {fullTurn}. This is the share of tax liability applied, not your
        tax rate.
      </p>
    </aside>
  );
}
