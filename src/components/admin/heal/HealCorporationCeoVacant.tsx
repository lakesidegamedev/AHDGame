"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface CorpDiagnostic {
  id: string;
  sequentialId: number;
  name: string;
  ceoId: string | null;
}

interface DiagnosticResult {
  totalAffected: number;
  missingCeoVacant: number;
  nullCeoVacant: number;
  corporations: CorpDiagnostic[];
}

export function HealCorporationCeoVacant() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/corporation-ceo-vacant",
    "This will set ceoVacant: false on all corporations with an active CEO that are missing the field, and create CEO self-votes.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal missing CEO vacant field</h3>
        <p className="mt-1 text-xs text-muted">
          Finds corporations with an active CEO but missing the ceoVacant field. Sets ceoVacant:
          false and creates a CEO self-vote so the field is properly initialized.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        diagnosePendingLabel={"Loading..."}
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          <p>
            <span className="text-muted">Corps missing ceoVacant field:</span>{" "}
            <span className="font-medium">{diagnostic.totalAffected}</span>
          </p>
          {diagnostic.corporations.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {diagnostic.corporations.map((c) => (
                <p key={c.id} className="flex justify-between">
                  <span>
                    #{c.sequentialId} {c.name}
                  </span>
                  <span className="text-muted">CEO: {c.ceoId ? "present" : "none"}</span>
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
