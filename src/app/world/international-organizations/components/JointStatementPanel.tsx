"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countriesCore";
import { canTableResolutionType } from "@/lib/constants/orgCategory";
import type { OrgSummary, OrgViewerInfo } from "../orgTypes";
import { orgProposingCountry } from "../orgTypes";
import { useEntityName } from "../useEntityName";
import { organizationVoteHandler, postOrganizationAction } from "../proposalActions";
import { ProposalBallotCard } from "../ProposalBallotCard";

interface Props {
  org: OrgSummary;
  viewer: OrgViewerInfo | null;
  currentTurn: number;
  votingWindowTurns: number;
  onChange: () => void;
}

type Stance = "endorse" | "condemn";

/**
 * Joint statements: a member-voted declaration the bloc issues about a subject
 * country — an endorsement (lifts that government's approval) or a condemnation
 * (hurts it), for a bounded window. Decided by a simple majority of members.
 * Shown only for categories that may table statements (political / security).
 */
export function JointStatementPanel({
  org,
  viewer,
  currentTurn,
  votingWindowTurns,
  onChange,
}: Props) {
  const entityName = useEntityName();
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  // Who tables resolutions: the FM/HoG country, or the member an org head sits
  // for (agenda pool). Votes stay on viewerFmCountry.
  const proposer = orgProposingCountry(viewer, org.id);
  const proposerIsMember = proposer != null && org.members.some((m) => m.countryId === proposer);
  const canTable = canTableResolutionType(org.def.category, "joint_statement");

  const pending = org.pendingLegislation.filter((l) => l.type === "joint_statement");
  const active = org.activeLegislation.filter((l) => l.type === "joint_statement");

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState<CountryId | "">("");
  const [stance, setStance] = useState<Stance>("endorse");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposer || !subject) {
      setError("Choose a subject country.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${proposer}/international-organizations/${org.id}/legislation`,
        { type: "joint_statement", subjectCountryId: subject, stance },
        "Failed to table statement"
      );
      setShowForm(false);
      setSubject("");
      setStance("endorse");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to table statement");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  const name = (c?: CountryId) => (c ? entityName(c) : "—");
  const stanceLabel = (s?: string) => (s === "condemn" ? "Condemnation" : "Endorsement");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Joint statements</h3>
          <p className="text-xs text-muted">
            A bloc declaration about a country. An endorsement lifts that government&apos;s
            approval, a condemnation hurts it, for a limited time. Passes by a majority of the
            members that hold a vote.
          </p>
        </div>
        {proposerIsMember && proposer && canTable && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Table statement"}
          </Button>
        )}
      </div>

      {showForm && proposerIsMember && proposer && canTable && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Table a joint statement</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="statement-subject">
                Subject country
              </label>
              <select
                id="statement-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value as CountryId)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select…</option>
                {COUNTRY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {entityName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="statement-stance">
                Stance
              </label>
              <select
                id="statement-stance"
                value={stance}
                onChange={(e) => setStance(e.target.value as Stance)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="endorse">Endorse (+ approval)</option>
                <option value="condemn">Condemn (− approval)</option>
              </select>
            </div>
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

      {/* In force */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-body-sm font-medium text-muted">In force</h4>
          {active.map((l) => {
            const turnsLeft =
              l.jointStatementExpiresOnTurn != null
                ? Math.max(0, l.jointStatementExpiresOnTurn - currentTurn)
                : null;
            const condemn = l.jointStatementStance === "condemn";
            return (
              <div
                key={l._id.toString()}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-5 ${
                  condemn ? "border-error/30 bg-error/5" : "border-success/30 bg-success/5"
                }`}
              >
                <div>
                  <h5 className="text-sm font-semibold text-foreground">
                    {stanceLabel(l.jointStatementStance)} of{" "}
                    {name(l.jointStatementSubjectCountryId)}
                  </h5>
                  <p className="mt-1 text-xs text-muted">
                    {condemn
                      ? "Lowers the subject government's approval"
                      : "Raises the subject government's approval"}
                    {turnsLeft != null && (
                      <>
                        {" "}
                        · Lifts in {turnsLeft} turn{turnsLeft === 1 ? "" : "s"}
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    condemn
                      ? "border-error/30 bg-error/10 text-error"
                      : "border-success/30 bg-success/10 text-success"
                  }`}
                >
                  In force
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending */}
      <div className="space-y-3">
        <h4 className="text-body-sm font-medium text-muted">Awaiting a vote</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No pending statements.</p>
          </div>
        ) : (
          pending.map((l) => {
            const turnsLeft = Math.max(0, l.closesOnTurn - currentTurn);
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
                <h5 className="text-sm font-semibold text-foreground">
                  {stanceLabel(l.jointStatementStance)} of {name(l.jointStatementSubjectCountryId)}
                </h5>
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
