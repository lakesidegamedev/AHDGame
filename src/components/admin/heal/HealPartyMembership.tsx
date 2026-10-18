"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface MismatchedMember {
  _id: string;
  name: string;
  type: "character" | "npp";
  homeState: string;
  memberCountry: string;
  currentPartyId: string;
  currentPartyName: string | null;
  currentPartyCountry: string | null;
  suggestedPartyId: string | null;
  suggestedPartyName: string | null;
}

interface DiagnosticResult {
  status: string;
  issueCount: number;
  records: MismatchedMember[];
  message: string;
}

export function HealPartyMembership() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/party-membership",
    "This will reassign characters and NPPs to the correct party in their country based on party name.\n\nMembers with no matching party will be set to independent.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal party membership</h3>
        <p className="mt-1 text-xs text-muted">
          Fixes characters and NPPs whose party assignment doesn&apos;t match their country. This
          can happen after party ID migrations when a US player ends up in a UK party (or vice
          versa). Members are reassigned to a party with the same name in their correct country.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        healPendingLabel={"Fixing..."}
        healLabel={"Fix party assignments"}
        healTone="warning"
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          {diagnostic.status === "ok" ? (
            <p className="text-success">{diagnostic.message}</p>
          ) : (
            <>
              <p className="font-medium text-warning">{diagnostic.message}</p>
              {diagnostic.records.length > 0 && (
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted border-b border-card-border">
                        <th className="pb-1">Name</th>
                        <th className="pb-1">Type</th>
                        <th className="pb-1">State</th>
                        <th className="pb-1">Current party</th>
                        <th className="pb-1">Suggested fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border/50">
                      {diagnostic.records.map((r) => (
                        <tr key={r._id}>
                          <td className="py-1 font-medium">{r.name}</td>
                          <td className="py-1">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${r.type === "character" ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted"}`}
                            >
                              {r.type === "character" ? "Player" : "NPP"}
                            </span>
                          </td>
                          <td className="py-1">{r.homeState}</td>
                          <td className="py-1">
                            <span className="text-error">
                              {r.currentPartyName ?? `ID: ${r.currentPartyId}`}
                              {r.currentPartyCountry && ` (${r.currentPartyCountry})`}
                            </span>
                          </td>
                          <td className="py-1">
                            {r.suggestedPartyName ? (
                              <span className="text-success">
                                {r.suggestedPartyName} ({r.memberCountry})
                              </span>
                            ) : (
                              <span className="text-muted italic">Independent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {diagnostic.issueCount > 100 && (
                    <p className="mt-2 text-muted italic">
                      Showing first 100 of {diagnostic.issueCount} records
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
