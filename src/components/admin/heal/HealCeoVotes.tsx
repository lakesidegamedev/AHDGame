"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface CorpDiagnostic {
  id: string;
  sequentialId: number;
  name: string;
  voteCount: number;
  hasPendingCeo: boolean;
}

interface DiagnosticResult {
  totalVacantCorps: number;
  corpsWithIssues: number;
  diagnostics: CorpDiagnostic[];
}

export function HealCeoVotes() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/ceo-votes",
    "This will clear all CEO votes and pending CEO offers for corporations with vacant CEO positions.\n\nThis allows shareholders to start fresh CEO elections.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal stale CEO votes</h3>
        <p className="mt-1 text-xs text-muted">
          Clears CEO votes and pending CEO offers for corporations with vacant CEO positions. Use
          when a CEO cannot accept the position due to stale vote data blocking re-election.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        diagnosePendingLabel={"Loading..."}
        healLabel={"Heal all vacant"}
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          <p>
            <span className="text-muted">Corporations with vacant CEO:</span>{" "}
            <span className="font-medium">{diagnostic.totalVacantCorps}</span>
          </p>
          <p>
            <span className="text-muted">With stale votes or pending CEO:</span>{" "}
            <span className="font-medium">{diagnostic.corpsWithIssues}</span>
          </p>
          {diagnostic.diagnostics.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {diagnostic.diagnostics.map((c) => (
                <p key={c.id} className="flex justify-between">
                  <span>
                    #{c.sequentialId} {c.name}
                  </span>
                  <span className="text-muted">
                    {c.voteCount} vote(s){c.hasPendingCeo ? ", pending CEO" : ""}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
