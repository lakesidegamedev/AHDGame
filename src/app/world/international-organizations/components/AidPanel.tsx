"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useState } from "react";
import { Button } from "@/components/ui";
import { type CountryId } from "@/lib/constants/countriesCore";
import { canTableResolutionType } from "@/lib/constants/orgCategory";
import type { OrgSummary, OrgViewerInfo } from "../orgTypes";
import { orgProposingCountry } from "../orgTypes";
import { useFundFormatter } from "./useFundFormatter";
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
 * Aid packages: a member funds a transfer to another member. Decided by a simple
 * majority of members; on passage the donor's treasury is debited and the
 * recipient's credited (USD-converted). Shown only for categories that may table
 * aid (political / economic / development).
 */
export function AidPanel({ org, viewer, currentTurn, votingWindowTurns, onChange }: Props) {
  const entityName = useEntityName();
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  // Who tables resolutions: the FM/HoG country, or the member an org head sits
  // for (agenda pool). Votes stay on viewerFmCountry.
  const proposer = orgProposingCountry(viewer, org.id);
  const proposerIsMember = proposer != null && org.members.some((m) => m.countryId === proposer);
  const canTable = canTableResolutionType(org.def.category, "aid_package");

  const pending = org.pendingLegislation.filter((l) => l.type === "aid_package");
  const active = org.activeLegislation.filter((l) => l.type === "aid_package");

  const [showForm, setShowForm] = useState(false);
  const [recipient, setRecipient] = useState<CountryId | "">("");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposer || !recipient) {
      setError("Choose a recipient.");
      return;
    }
    const amountValue = Number(amount);
    if (!(amountValue > 0)) {
      setError("Enter a positive amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${proposer}/international-organizations/${org.id}/legislation`,
        {
          type: "aid_package",
          recipientCountryId: recipient,
          amount: amountValue,
        },
        "Failed to table aid package"
      );
      setShowForm(false);
      setRecipient("");
      setAmount("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to table aid package");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  const name = (c?: CountryId) => (c ? entityName(c) : "—");
  // Agreed and proposed package sizes are a record, so they read in the viewer's
  // currency. The Amount field below stays in the fund's, and says so in its
  // label — the route banks what is typed there straight into the fund.
  const fundAmount = useFundFormatter(org.fund);
  const fundAmt = (n?: number) => (n ? fundAmount(n) : "—");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Aid packages</h3>
          <p className="text-xs text-muted">
            A member funds a transfer to another member. Passes by a majority of the members that
            hold a vote.
          </p>
        </div>
        {proposerIsMember && proposer && canTable && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Table aid package"}
          </Button>
        )}
      </div>

      {showForm && proposerIsMember && proposer && canTable && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Table an aid package</h4>
          <p className="mt-1 text-xs text-muted">
            Funded from the organization&apos;s pooled treasury.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="aid-recipient">
                Recipient
              </label>
              <select
                id="aid-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value as CountryId)}
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select…</option>
                {/* Aid lands in a treasury, so a macro-tier member has nowhere
                    to receive it — offering one would propose a payment that
                    cannot be made. */}
                {org.members
                  .filter((m) => m.isCountry)
                  .map((m) => (
                    <option key={m.countryId} value={m.countryId}>
                      {m.countryName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="aid-amount">
                Amount ({org.fund.currencyCode})
              </label>
              <input
                id="aid-amount"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000000"
                className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              />
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

      {/* Disbursed */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-body-sm font-medium text-muted">Disbursed</h4>
          {active.map((l) => (
            <div
              key={l._id.toString()}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/5 p-5"
            >
              <div>
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
                <p className="mt-1 text-xs text-muted">
                  {name(l.aidRecipientCountryId)} · {fundAmt(l.aidAmount)}
                </p>
              </div>
              <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                Disbursed
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
            <p className="text-sm text-muted">No pending aid packages.</p>
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
                progressClassName="bg-success"
              >
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
                <p className="mt-0.5 text-xs text-muted">
                  {name(l.aidRecipientCountryId)} · {fundAmt(l.aidAmount)}
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
