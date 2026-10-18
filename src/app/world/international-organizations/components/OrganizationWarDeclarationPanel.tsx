"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { useEnabledCountryIds } from "@/lib/hooks/useEnabledCountryIds";
import { WAR_GOALS } from "@/lib/military/warGoals";
import type { OrgSummary, OrgViewerInfo } from "../orgTypes";
import { organizationVoteHandler, postOrganizationAction } from "../proposalActions";
import { ProposalBallotCard } from "../ProposalBallotCard";

interface Props {
  org: OrgSummary;
  viewer: OrgViewerInfo | null;
  currentTurn: number;
  votingWindowTurns: number;
  onChange: () => void;
}

export function OrganizationWarDeclarationPanel({
  org,
  viewer,
  currentTurn,
  votingWindowTurns,
  onChange,
}: Props) {
  const resolveCountryName = useCountryDisplayName();
  const viewerCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  const viewerIsMember =
    viewerCountry != null && org.members.some((member) => member.countryId === viewerCountry);
  const memberIds = new Set(org.members.map((member) => member.countryId));
  const targets = useEnabledCountryIds().filter((countryId) => !memberIds.has(countryId));
  const pending = org.pendingLegislation.filter((item) => item.type === "declare_war");

  const [showForm, setShowForm] = useState(false);
  const [targetCountryId, setTargetCountryId] = useState("");
  const [warGoal, setWarGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!viewerCountry || !targetCountryId || !warGoal) return;
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${viewerCountry}/international-organizations/${org.id}/legislation`,
        { type: "declare_war", targetCountryId, warGoal },
        "Failed to propose a declaration of war"
      );
      setShowForm(false);
      onChange();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to propose a declaration of war"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerCountry, onChange, "legislation");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Collective declaration of war</h3>
          <p className="text-xs text-muted">
            Every player nation in the bloc must consent. If the resolution passes, NPP nations join
            automatically. Each eligible player nation then votes on its own declaration in every
            voting chamber at the same time. A failed national declaration keeps only that country
            out of the war.
          </p>
        </div>
        {viewerIsMember && viewerCountry && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((visible) => !visible)}
          >
            {showForm ? "Cancel" : "Propose declaration"}
          </Button>
        )}
      </div>

      {showForm && viewerIsMember && viewerCountry && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Propose a collective war</h4>
          <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="org-war-target">
                Target country
              </label>
              <select
                id="org-war-target"
                value={targetCountryId}
                onChange={(event) => setTargetCountryId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select a country</option>
                {targets.map((countryId) => (
                  <option key={countryId} value={countryId}>
                    {resolveCountryName(countryId)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="org-war-goal">
                War goal
              </label>
              <select
                id="org-war-goal"
                value={warGoal}
                onChange={(event) => setWarGoal(event.target.value)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select a war goal</option>
                {WAR_GOALS.map((goal) => (
                  <option key={goal.id} value={goal.id} disabled={!goal.selectable}>
                    {goal.label}
                    {goal.selectable ? "" : " (not yet available)"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <InlineError error={error} className="mt-2 text-xs text-error" />
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              isLoading={submitting}
              disabled={!targetCountryId || !warGoal}
            >
              Submit for a vote
            </Button>
            <Button variant="ghost" size="md" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-body-sm font-medium text-muted">Pending declarations</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No declaration resolutions are pending.</p>
          </div>
        ) : (
          pending.map((item) => {
            const turnsLeft = Math.max(0, item.closesOnTurn - currentTurn);
            return (
              <ProposalBallotCard
                key={item._id.toString()}
                legislation={item}
                org={org}
                viewerCountry={viewerCountry}
                electorate="hasVote"
                turnsLeft={turnsLeft}
                votingWindowTurns={votingWindowTurns}
                onVote={vote}
              >
                <h5 className="text-sm font-semibold text-foreground">{item.title}</h5>
                <p className="mt-0.5 text-xs text-muted">
                  Tabled by {item.proposedByCharacterName} · closes in {turnsLeft} turn
                  {turnsLeft === 1 ? "" : "s"}
                </p>
              </ProposalBallotCard>
            );
          })
        )}
      </div>
    </section>
  );
}
