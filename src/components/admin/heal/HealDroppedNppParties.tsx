"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticNpp {
  _id: string;
  name: string;
  countryId: string;
  homeState: string;
  currentOffice: string | null;
  policies: { economic: number; social: number };
  inferredParty: string | null;
  inferredPartyName: string | null;
}

interface DiagnosticResult {
  status: string;
  message: string;
  droppedNpps: DiagnosticNpp[];
  totalAffected: number;
}

export function HealDroppedNppParties() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/dropped-npp-parties",
    "This will restore party affiliations for NPPs based on their policy positions.\n\nContinue?"
  );

  const formatPolicies = (policies: { economic: number; social: number }) => {
    return `E:${policies.economic > 0 ? "+" : ""}${policies.economic}, S:${policies.social > 0 ? "+" : ""}${policies.social}`;
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal dropped NPP parties</h3>
        <p className="mt-1 text-xs text-muted">
          Restores party affiliations for system-generated NPPs that incorrectly became
          independents. Uses policy positions to infer the correct party.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        diagnosePendingLabel={"Running…"}
        healPendingLabel={"Healing…"}
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-3 text-xs">
          {diagnostic.status === "ok" ? (
            <p className="text-success">{diagnostic.message}</p>
          ) : (
            <>
              <p className="font-medium text-error">{diagnostic.message}</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {diagnostic.droppedNpps.map((npp) => (
                  <div
                    key={npp._id}
                    className="border-t border-card-border pt-2 first:border-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{npp.name}</span>
                      <span className="text-muted">
                        {npp.countryId} · {npp.homeState}
                      </span>
                    </div>
                    <div className="mt-1 text-muted">
                      Policies: {formatPolicies(npp.policies)} →{" "}
                      <span className="text-success font-medium">{npp.inferredPartyName}</span>
                    </div>
                    {npp.currentOffice && (
                      <div className="text-[10px] text-muted mt-0.5">
                        Office: {npp.currentOffice}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {diagnostic.totalAffected > 100 && (
                <p className="text-muted text-[10px]">
                  Showing first 100 of {diagnostic.totalAffected} affected NPPs.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
