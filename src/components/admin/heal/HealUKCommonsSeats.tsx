"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface RegionIssue {
  region: string;
  status: "missing" | "mismatch";
  expectedSeats: number;
  actualSeats: number;
}

interface DiagnosticResult {
  status: string;
  message: string;
  totalRegions: number;
  issuesFound: number;
  regions: RegionIssue[];
}

export function HealUKCommonsSeats() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/uk-commons-seats",
    "This will delete all UK Commons electedOfficials and recreate them from the most recent resolved elections.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal UK Commons seats</h3>
        <p className="mt-1 text-xs text-muted">
          Recreates UK Commons electedOfficials from the most recent resolved election results.
          Fixes missing seats after elections that failed to populate officials.
        </p>
      </div>

      <HealPanelActions loading={loading} onDiagnose={runDiagnostic} onHeal={runHeal} />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 text-xs space-y-2">
          <p className={diagnostic.status === "ok" ? "text-success" : "text-error"}>
            {diagnostic.message}
          </p>
          {diagnostic.regions.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="font-medium">Regions with issues:</p>
              <ul className="list-disc list-inside text-muted">
                {diagnostic.regions.map((r) => (
                  <li key={r.region}>
                    {r.region}:{" "}
                    {r.status === "missing"
                      ? "missing"
                      : `${r.actualSeats}/${r.expectedSeats} seats`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
