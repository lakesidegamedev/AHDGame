"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticResult {
  orphanOfficials: number;
  orphanElections: number;
  examples: {
    officials: { state: string; senateClass: number; characterId: string | null }[];
    elections: { state: string; senateClass: number; status: string }[];
  };
}

export function HealSenateClasses() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/officials/heal-senate",
    "This will permanently delete senate officials and elections whose class does not belong to their state.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal Senate classes</h3>
        <p className="mt-1 text-xs text-muted">
          Removes ElectedOfficial and Election records whose senate class does not belong to their
          state. Fixes states incorrectly showing all 3 classes instead of their correct 2.
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
            <span className={diagnostic.orphanOfficials > 0 ? "text-error" : "text-success"}>
              {diagnostic.orphanOfficials} orphan official(s)
            </span>{" "}
            and{" "}
            <span className={diagnostic.orphanElections > 0 ? "text-error" : "text-success"}>
              {diagnostic.orphanElections} orphan election(s)
            </span>
          </p>
          {diagnostic.examples.officials.length > 0 && (
            <div>
              <p className="text-muted font-medium mb-1">Example orphan officials:</p>
              {diagnostic.examples.officials.map((o, i) => (
                <p key={i} className="text-muted">
                  {o.state} — Class {o.senateClass}
                  {o.characterId ? " (occupied)" : " (vacant)"}
                </p>
              ))}
            </div>
          )}
          {diagnostic.examples.elections.length > 0 && (
            <div>
              <p className="text-muted font-medium mb-1">Example orphan elections:</p>
              {diagnostic.examples.elections.map((e, i) => (
                <p key={i} className="text-muted">
                  {e.state} — Class {e.senateClass} ({e.status})
                </p>
              ))}
            </div>
          )}
          {diagnostic.orphanOfficials === 0 && diagnostic.orphanElections === 0 && (
            <p className="text-success">No orphan records found — senate classes look healthy.</p>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
