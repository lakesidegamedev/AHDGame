"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import {
  ALERT_POSTURES,
  POSTURE_META,
  postureWarEntryNote,
  type AlertPosture,
} from "@/lib/constants/orgPosture";
import type { OrgSummary, OrgViewerInfo } from "../orgTypes";
import { orgProposingCountry } from "../orgTypes";
import { organizationVoteHandler, postOrganizationAction } from "../proposalActions";
import { ProposalBallotCard } from "../ProposalBallotCard";

interface Props {
  org: OrgSummary;
  viewer: OrgViewerInfo | null;
  currentTurn: number;
  votingWindowTurns: number;
  onChange: () => void;
}

/**
 * Alliance alert posture: members vote (a `set_posture` resolution) to move the
 * bloc between Reduced / Standard / Heightened / Article 5, each a bounded
 * benefit-with-a-cost effect applied to every member while in force. Shown only
 * for categories that may set posture (security).
 */
export function PosturePanel({ org, viewer, currentTurn, votingWindowTurns, onChange }: Props) {
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  // Who tables resolutions: the FM/HoG country, or the member an org head sits
  // for (agenda pool). Votes stay on viewerFmCountry.
  const proposer = orgProposingCountry(viewer, org.id);
  const proposerIsMember = proposer != null && org.members.some((m) => m.countryId === proposer);

  const pending = org.pendingLegislation.filter((l) => l.type === "set_posture");
  const current = org.posture;

  const [showForm, setShowForm] = useState(false);
  const [posture, setPosture] = useState<AlertPosture>(current);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposer) return;
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${proposer}/international-organizations/${org.id}/legislation`,
        { type: "set_posture", posture },
        "Failed to propose posture change"
      );
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose posture change");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Alert posture</h3>
          <p className="text-xs text-muted">
            The alliance is at{" "}
            <span className="font-semibold text-foreground">{POSTURE_META[current].label}</span>{" "}
            posture. {POSTURE_META[current].blurb} Changing it needs a majority of the members that
            hold a vote.
          </p>
          <p className="mt-1 text-xs text-muted">
            {postureWarEntryNote({
              category: org.def.category,
              posture: org.posture,
              standingMutualDefence: org.def.standingMutualDefence,
            })}
          </p>
        </div>
        {proposerIsMember && proposer && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Propose posture change"}
          </Button>
        )}
      </div>

      {showForm && proposerIsMember && proposer && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Propose an alert posture</h4>
          <div className="mt-3 max-w-md">
            <label className="text-xs font-medium text-muted" htmlFor="posture-select">
              Posture
            </label>
            <select
              id="posture-select"
              value={posture}
              onChange={(e) => setPosture(e.target.value as AlertPosture)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {ALERT_POSTURES.map((p) => (
                <option key={p} value={p}>
                  {POSTURE_META[p].label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">{POSTURE_META[posture].blurb}</p>
          </div>
          <InlineError error={error} className="mt-2 text-xs text-error" />
          <div className="mt-4 flex gap-2">
            <Button variant="primary" size="md" onClick={submit} isLoading={submitting}>
              Submit for a vote
            </Button>
            <Button variant="ghost" size="md" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-body-sm font-medium text-muted">Pending posture votes</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No pending posture changes.</p>
          </div>
        ) : (
          pending.map((l) => {
            const turnsLeft = Math.max(0, l.closesOnTurn - currentTurn);
            const target = l.postureValue ? POSTURE_META[l.postureValue].label : "—";
            return (
              <ProposalBallotCard
                key={l._id.toString()}
                legislation={l}
                org={org}
                viewerCountry={viewerFmCountry}
                electorate="hasPolicyVote"
                turnsLeft={turnsLeft}
                votingWindowTurns={votingWindowTurns}
                onVote={vote}
              >
                <h5 className="text-sm font-semibold text-foreground">Move to {target}</h5>
                <p className="mt-0.5 text-xs text-muted">
                  Tabled by {l.proposedByCharacterName} · closes in {turnsLeft} turn
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
