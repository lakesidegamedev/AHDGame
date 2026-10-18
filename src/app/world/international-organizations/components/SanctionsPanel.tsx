"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import { CountryFlag } from "@/components/CountryFlag";
import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countries";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
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

/**
 * Sanctions resolutions: a bloc embargoes a target country on one commodity.
 * Decided by a simple majority of members (any member FM may vote), unlike
 * FTAs. Only shown for categories whose powers include sanctions.
 */
export function SanctionsPanel({ org, viewer, currentTurn, votingWindowTurns, onChange }: Props) {
  const entityName = useEntityName();
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  // Who tables resolutions: the FM/HoG country, or the member an org head sits
  // for (agenda pool). Votes stay on viewerFmCountry.
  const proposer = orgProposingCountry(viewer, org.id);
  const proposerIsMember = proposer != null && org.members.some((m) => m.countryId === proposer);
  const canTable = canTableResolutionType(org.def.category, "sanctions");

  const pending = org.pendingLegislation.filter((l) => l.type === "sanctions");
  const active = org.activeLegislation.filter((l) => l.type === "sanctions");

  const [showForm, setShowForm] = useState(false);
  const [target, setTarget] = useState<CountryId | "">("");
  const [commodity, setCommodity] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposer || !target) {
      setError("Choose a target country.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${proposer}/international-organizations/${org.id}/legislation`,
        { type: "sanctions", targetCountryId: target, commodity },
        "Failed to table sanctions"
      );
      setShowForm(false);
      setTarget("");
      setCommodity("all");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to table sanctions");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  const commodityLabel = (c?: string) => (c === "all" || !c ? "all commodities" : c);
  const targetLabel = (l: { sanctionsTargetCountryId?: CountryId }) =>
    l.sanctionsTargetCountryId ? entityName(l.sanctionsTargetCountryId) : "—";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Sanctions</h3>
          <p className="text-xs text-muted">
            Members jointly embargo a target country on one commodity. Passes by a majority of the
            members that hold a vote.
          </p>
        </div>
        {proposerIsMember && proposer && canTable && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Table sanctions"}
          </Button>
        )}
      </div>

      {showForm && proposerIsMember && proposer && canTable && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Table a sanctions resolution</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="sanction-target">
                Target country
              </label>
              <select
                id="sanction-target"
                value={target}
                onChange={(e) => setTarget(e.target.value as CountryId)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select…</option>
                {/* Members excluded, not just the viewer: an organisation
                    sanctions an outsider, and the route refuses a fellow member
                    outright, so listing one offers a choice the server will
                    reject. */}
                {COUNTRY_ORDER.filter((c) => !org.members.some((m) => m.countryId === c)).map(
                  (c) => (
                    <option key={c} value={c}>
                      {entityName(c)}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="sanction-commodity">
                Commodity
              </label>
              <select
                id="sanction-commodity"
                value={commodity}
                onChange={(e) => setCommodity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="all">All commodities</option>
                {COMMODITY_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
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

      {/* Active */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-body-sm font-medium text-muted">Active</h4>
          {active.map((l) => (
            <div
              key={l._id.toString()}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-error/30 bg-error/5 p-5"
            >
              <div>
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
                <p className="mt-1 text-xs text-muted">
                  Embargoing {targetLabel(l)} · {commodityLabel(l.sanctionsCommodity)}
                </p>
                {l.sanctionsExpiresOnTurn != null && (
                  <p className="mt-0.5 text-xs text-muted">
                    Lifts in {Math.max(0, l.sanctionsExpiresOnTurn - currentTurn)} turn
                    {Math.max(0, l.sanctionsExpiresOnTurn - currentTurn) === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <span className="rounded-full border border-error/30 bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                In force
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pending */}
      <div className="space-y-3">
        <h4 className="text-body-sm font-medium text-muted">Awaiting a vote</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No pending sanctions.</p>
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
                progressClassName="bg-error"
              >
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  Embargoing
                  {l.sanctionsTargetCountryId && (
                    <CountryFlag country={l.sanctionsTargetCountryId} size="sm" />
                  )}
                  {targetLabel(l)} · {commodityLabel(l.sanctionsCommodity)}
                </p>
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
