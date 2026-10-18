"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import { MAX_ORG_DUES_RATE_ANNUAL } from "@/lib/constants/internationalOrganizations";
import type { OrgSummary, OrgViewerInfo } from "../orgTypes";
import { orgProposingCountry } from "../orgTypes";
import { formatFundAmount } from "./fundCurrency";
import { useFundFormatter } from "./useFundFormatter";
import { organizationVoteHandler, postOrganizationAction } from "../proposalActions";
import { ProposalBallotCard } from "../ProposalBallotCard";

interface Props {
  org: OrgSummary;
  viewer: OrgViewerInfo | null;
  currentTurn: number;
  votingWindowTurns: number;
  onChange: () => void;
}

const MAX_DUES_PCT = MAX_ORG_DUES_RATE_ANNUAL * 100;

/**
 * Org treasury & dues: shows the pooled fund balance + current dues rate, and
 * lets members table + vote a `set_dues` resolution (simple majority) to change
 * the annual assessment that capitalizes the fund each turn.
 */
export function DuesPanel({ org, viewer, currentTurn, votingWindowTurns, onChange }: Props) {
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  // Who tables resolutions: the FM/HoG country, or the member an org head sits
  // for (agenda pool). Votes stay on viewerFmCountry.
  const proposer = orgProposingCountry(viewer, org.id);
  const proposerIsMember = proposer != null && org.members.some((m) => m.countryId === proposer);

  const pending = org.pendingLegislation.filter((l) => l.type === "set_dues");

  const [showForm, setShowForm] = useState(false);
  const [pct, setPct] = useState<string>((org.fund.duesRateAnnual * 100).toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposer) return;
    const pctNum = Number(pct);
    if (!(pctNum >= 0) || pctNum > MAX_DUES_PCT) {
      setError(`Enter a rate between 0 and ${MAX_DUES_PCT}%.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${proposer}/international-organizations/${org.id}/legislation`,
        { type: "set_dues", duesRateAnnual: pctNum / 100 },
        "Failed to propose dues change"
      );
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose dues change");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  // Balance native, assessment converted: one is the account, the other is a
  // figure you are only reading.
  const fundAmount = useFundFormatter(org.fund);
  const fundDisplay = formatFundAmount(org.fund.balanceLocal, org.fund.currencyCode);
  const ratePct = `${(org.fund.duesRateAnnual * 100).toFixed(3)}%`;
  const annualDuesDisplay = fundAmount(org.fund.annualDuesLocal ?? 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Treasury &amp; dues</h3>
          <p className="text-xs text-muted">
            Members are assessed <span className="font-semibold text-foreground">{ratePct}</span> of
            GDP / year (about{" "}
            <span className="font-semibold text-foreground">{annualDuesDisplay}/yr</span> across its
            VOTING members — the rest pay tribute at a fixed rate they do not set) into the pooled
            fund (currently <span className="font-semibold text-foreground">{fundDisplay}</span>).
            Changing the rate needs a majority of the members that hold a vote.
          </p>
        </div>
        {proposerIsMember && proposer && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Propose dues change"}
          </Button>
        )}
      </div>

      {showForm && proposerIsMember && proposer && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Propose a dues rate</h4>
          <div className="mt-3 max-w-xs">
            <label className="text-xs font-medium text-muted" htmlFor="dues-rate">
              Annual dues (% of member GDP)
            </label>
            <input
              id="dues-rate"
              type="number"
              min={0}
              max={MAX_DUES_PCT}
              step={0.001}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted">Max {MAX_DUES_PCT}% / year.</p>
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
        <h4 className="text-body-sm font-medium text-muted">Pending dues votes</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No pending dues changes.</p>
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
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
                <p className="mt-0.5 text-xs text-muted">
                  Proposed: {((l.duesRateAnnual ?? 0) * 100).toFixed(3)}% of GDP / year · tabled by{" "}
                  {l.proposedByCharacterName} · closes in {turnsLeft} turn
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
