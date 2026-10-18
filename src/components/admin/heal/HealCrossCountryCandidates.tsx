"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticResult {
  crossCountryCandidates: number;
  examples: Array<{
    characterName: string;
    nppCountry: string;
    electionCountry: string;
    electionType: string;
    state: string;
  }>;
}

export function HealCrossCountryCandidates() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/candidates/heal-cross-country",
    "This will withdraw all NPP candidates from elections in countries different from their home country.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal cross-country candidates</h3>
        <p className="mt-1 text-xs text-muted">
          Finds and withdraws NPP candidates who are in elections from a different country than
          their home country.
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
            <span className={diagnostic.crossCountryCandidates > 0 ? "text-error" : "text-success"}>
              {diagnostic.crossCountryCandidates} cross-country candidate(s)
            </span>
          </p>
          {diagnostic.examples.length > 0 && (
            <div>
              <p className="text-muted font-medium mb-1">Examples:</p>
              {diagnostic.examples.map((e, i) => (
                <p key={i} className="text-muted">
                  {e.characterName} ({e.nppCountry}) in {e.electionCountry} {e.electionType} —{" "}
                  {e.state}
                </p>
              ))}
            </div>
          )}
          {diagnostic.crossCountryCandidates === 0 && (
            <p className="text-success">No cross-country candidates found.</p>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
