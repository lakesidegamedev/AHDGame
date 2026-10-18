"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface OrphanedCandidate {
  candidateId: string;
  characterId: string;
  characterName: string;
  electionType: "state" | "national" | "committee";
  countryId: string;
  partyId: string;
  partyName: string;
  position?: string;
  characterParty: string;
  characterPartyName: string;
}

interface DiagnosticResult {
  status: string;
  issueCount: number;
  candidates: OrphanedCandidate[];
  message: string;
}

export function HealPartyLeadershipElections() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/party-leadership-elections",
    "This will withdraw all candidates from party leadership elections who are no longer members of that party.\n\nContinue?"
  );

  const getElectionTypeLabel = (type: "state" | "national" | "committee") => {
    switch (type) {
      case "state":
        return "State Party";
      case "national":
        return "National Party";
      case "committee":
        return "National Committee";
    }
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal party leadership elections member left</h3>
        <p className="mt-1 text-xs text-muted">
          Finds and withdraws candidates from party leadership elections (Chair, Vice Chair,
          Treasurer, National Committee) who are no longer members of that party. This can happen if
          a player leaves a party while registered for an election.
        </p>
      </div>

      <HealPanelActions
        loading={loading}
        onDiagnose={runDiagnostic}
        onHeal={runHeal}
        healPendingLabel={"Fixing..."}
        healLabel={"Withdraw invalid candidates"}
        healTone="warning"
      />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 space-y-2 text-xs">
          {diagnostic.status === "ok" ? (
            <p className="text-success">{diagnostic.message}</p>
          ) : (
            <>
              <p className="font-medium text-warning">{diagnostic.message}</p>
              {diagnostic.candidates.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted border-b border-card-border">
                        <th className="pb-1">Name</th>
                        <th className="pb-1">Country</th>
                        <th className="pb-1">Election type</th>
                        <th className="pb-1">Election party</th>
                        <th className="pb-1">Current party</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border/50">
                      {diagnostic.candidates.map((c) => (
                        <tr key={c.candidateId}>
                          <td className="py-1">{c.characterName}</td>
                          <td className="py-1">{c.countryId}</td>
                          <td className="py-1">
                            {getElectionTypeLabel(c.electionType)}
                            {c.position && ` (${c.position})`}
                          </td>
                          <td className="py-1">{c.partyName}</td>
                          <td className="py-1 text-warning">{c.characterPartyName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {diagnostic.issueCount > 50 && (
                    <p className="mt-2 text-muted italic">
                      Showing first 50 of {diagnostic.issueCount} candidates
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
