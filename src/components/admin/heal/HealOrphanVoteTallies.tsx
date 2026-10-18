"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticResult {
  orphanTallies: number;
  examples: Array<{
    electionId: string;
    candidateCount: number;
  }>;
}

export function HealOrphanVoteTallies() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/elections/heal-orphan-tallies",
    "This will delete vote tallies for elections that no longer exist.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal orphan vote tallies</h3>
        <p className="mt-1 text-xs text-muted">
          Finds and removes vote tallies for elections that no longer exist in the database.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        diagnosePendingLabel={"Running…"}
        healPendingLabel={"Healing…"}
        healLabel={"Heal now"}
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          <p className="font-medium">
            Found{" "}
            <span className={diagnostic.orphanTallies > 0 ? "text-error" : "text-success"}>
              {diagnostic.orphanTallies} orphan tally record(s)
            </span>
          </p>
          {diagnostic.examples.length > 0 && (
            <div>
              <p className="text-muted font-medium mb-1">Examples (by election ID):</p>
              {diagnostic.examples.map((e, i) => (
                <p key={i} className="text-muted">
                  {e.electionId} — {e.candidateCount} candidates
                </p>
              ))}
            </div>
          )}
          {diagnostic.orphanTallies === 0 && (
            <p className="text-success">No orphan vote tallies found.</p>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
