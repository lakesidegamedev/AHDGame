"use client";

import { InlineError } from "@/components/ui/InlineError";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { mutualDefenceBasis } from "@/lib/constants/mutualDefence";
import { canTableResolutionType } from "@/lib/constants/orgCategory";
import type { ConflictOption } from "@/lib/military/dto/conflictOption";
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

/**
 * Entry into a conflict at the bloc's call: members vote a `join_conflict`
 * resolution. Defensive-side entry is immediate after passage; offensive-side
 * entry puts a bill before both chambers of every eligible member's legislature.
 *
 * Rendered only for a category that may table it — which in a Cold War world is
 * the two blocs and nothing else. The gate reads the org's EFFECTIVE category,
 * the same value `proposeLegislation` checks, so this surface can never offer a
 * resolution the write path would refuse.
 */
export function JoinConflictPanel({
  org,
  viewer,
  currentTurn,
  votingWindowTurns,
  onChange,
}: Props) {
  const canTable = canTableResolutionType(org.def.category, "join_conflict");
  const viewerFmCountry = viewer?.foreignMinisterOf ?? viewer?.headOfGovernmentOf ?? null;
  const viewerIsMember =
    viewerFmCountry != null && org.members.some((m) => m.countryId === viewerFmCountry);

  const pending = org.pendingLegislation.filter((l) => l.type === "join_conflict");

  const [showForm, setShowForm] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictOption[]>([]);
  const [theaterId, setTheaterId] = useState("");
  const [side, setSide] = useState<"A" | "B">("A");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded only when the form opens: two organisations in the world can table
  // this, so the world view is not taxed with a conflict roster nobody else reads.
  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/world/conflicts");
        if (!res.ok) return;
        const body = (await res.json()) as { conflicts?: ConflictOption[] };
        if (cancelled) return;
        const rows = body.conflicts ?? [];
        setConflicts(rows);
        setTheaterId((current) => current || (rows[0]?.id ?? ""));
      } catch {
        // Leaving the list empty is the honest failure: the submit below stays
        // disabled rather than posting a theater id nobody picked.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm]);

  if (!canTable) return null;

  const selected = conflicts.find((c) => c.id === theaterId) ?? null;

  async function submit() {
    if (!viewerFmCountry || !theaterId) return;
    setSubmitting(true);
    setError(null);
    try {
      await postOrganizationAction(
        `/api/country/${viewerFmCountry}/international-organizations/${org.id}/legislation`,
        { type: "join_conflict", theaterId, side },
        "Failed to propose entry"
      );
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose entry");
    } finally {
      setSubmitting(false);
    }
  }

  const vote = organizationVoteHandler(viewerFmCountry, onChange, "legislation");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Entry into a conflict</h3>
          <p className="text-xs text-muted">
            Call the bloc into a war already being fought. Entry needs unanimous consent from every
            member that holds a vote. A defensive call takes effect immediately. An offensive call
            then puts the question to both chambers of each eligible member&apos;s legislature, and
            each country decides for itself.
          </p>
          <p className="mt-1 text-xs text-muted">
            {mutualDefenceBasis({
              category: org.def.category,
              posture: org.posture,
              standingMutualDefence: org.def.standingMutualDefence,
            })
              ? "Defence of a member is not voted on. If a member is declared on, every player-led member of this alliance enters that war at once. Leaving the alliance beforehand is the only way to stay out of it, and leaving after a war has begun does not take you out of that war."
              : "Defence of a member is not automatic at this posture. Only the Article 5 posture brings every player-led member into a war when a member is declared on; until then, this vote is the way in."}
          </p>
          <p className="mt-1 text-xs text-muted">
            An attack that began before a country joined is not retroactive. Members may unanimously
            extend collective defence to that live war. If the vote passes, alliance members enter
            immediately without national legislation.
          </p>
        </div>
        {viewerIsMember && viewerFmCountry && (
          <Button
            size="md"
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Propose entry"}
          </Button>
        )}
      </div>

      {showForm && viewerIsMember && viewerFmCountry && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h4 className="text-sm font-semibold text-foreground">Propose entry into a conflict</h4>
          {conflicts.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No conflicts are being fought right now.</p>
          ) : (
            <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted" htmlFor="join-conflict-theater">
                  Conflict
                </label>
                <select
                  id="join-conflict-theater"
                  value={theaterId}
                  onChange={(e) => setTheaterId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {conflicts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted" htmlFor="join-conflict-side">
                  Side
                </label>
                <select
                  id="join-conflict-side"
                  value={side}
                  onChange={(e) => setSide(e.target.value as "A" | "B")}
                  className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="A">{selected?.sideALabel ?? "Side A"}</option>
                  <option value="B">{selected?.sideBLabel ?? "Side B"}</option>
                </select>
              </div>
            </div>
          )}
          {selected && (
            <p className="mt-2 text-xs text-muted">
              {selected.name}: {selected.sideALabel} against {selected.sideBLabel}.
            </p>
          )}
          <InlineError error={error} className="mt-2 text-xs text-error" />
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              isLoading={submitting}
              disabled={!theaterId}
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
        <h4 className="text-body-sm font-medium text-muted">Pending entry votes</h4>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card p-5">
            <p className="text-sm text-muted">No pending entry resolutions.</p>
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
                electorate="hasVote"
                turnsLeft={turnsLeft}
                votingWindowTurns={votingWindowTurns}
                onVote={vote}
              >
                <h5 className="text-sm font-semibold text-foreground">{l.title}</h5>
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
