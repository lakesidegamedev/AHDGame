"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticResult {
  affectedTallies: number;
  affected: Array<{
    electionId: string;
    electionType: string;
    state: string;
    withdrawnCandidates: string[];
    staleVotes: number;
  }>;
}

export function HealWithdrawnTallies() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/elections/heal-withdrawn-tallies",
    "This will remove withdrawn candidates' vote data from all active election tallies.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal withdrawn candidate tallies</h3>
        <p className="mt-1 text-xs text-muted">
          Finds and removes withdrawn candidates&apos; votes, names, and seat estimates from active
          election tallies. Fixes incorrect vote share percentages and seat projections after NPP
          withdrawals.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        diagnosePendingLabel={"Running\u2026"}
        healPendingLabel={"Healing\u2026"}
        healLabel={"Heal now"}
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          <p className="font-medium">
            Found{" "}
            <span className={diagnostic.affectedTallies > 0 ? "text-error" : "text-success"}>
              {diagnostic.affectedTallies} tally record(s) with stale data
            </span>
          </p>
          {diagnostic.affected.length > 0 && (
            <div className="space-y-1">
              {diagnostic.affected.map((e, i) => (
                <div key={i} className="text-muted">
                  <span className="font-medium text-foreground/80">
                    {e.electionType} ({e.state})
                  </span>
                  {" — "}
                  {e.withdrawnCandidates.join(", ")} ({e.staleVotes.toLocaleString("en-US")} stale
                  votes)
                </div>
              ))}
            </div>
          )}
          {diagnostic.affectedTallies === 0 && (
            <p className="text-success">All tallies are clean.</p>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
