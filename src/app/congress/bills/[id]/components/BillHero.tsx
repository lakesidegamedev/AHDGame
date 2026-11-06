import Link from "next/link";
import { BillProposalChip } from "@/components/bills/BillProposalChip";
import { GameMonthTime } from "@/components/time/GameMonthTime";
import type { BillDetail } from "../types";
import { chamberLabel } from "../billHelpers";
import { StatusBadge } from "./StatusBadge";
import { DeadlineCountdown } from "./DeadlineCountdown";

interface HeroVotes {
  for: number;
  against: number;
  abstain: number;
}

interface BillHeroProps {
  bill: BillDetail;
  votes: HeroVotes;
  eligible: number;
  /** Deadline for the vote currently on the floor, if one is live. */
  liveDeadline?: string | null;
  filibustered: boolean;
  supermajority: boolean;
  /** The viewer's vote in the chamber currently on the floor. */
  myVote?: string | null;
  onAction: (action: string) => void;
}

/** Accent stripe along the top of the hero, keyed to where the bill stands. */
const STATUS_ACCENT: Record<string, string> = {
  active: "bg-yellow-400",
  active_other: "bg-yellow-400",
  active_both: "bg-yellow-400",
  veto_override: "bg-amber-400",
  override_shugiin: "bg-amber-400",
  cabinet_review: "bg-amber-400",
  enrolled: "bg-purple-400",
  passed_origin: "bg-cyan-400",
  signed: "bg-emerald-400",
  vetoed: "bg-error",
  failed: "bg-error",
  override_failed: "bg-error",
};

function pct(n: number, of: number): string {
  if (of <= 0) return "";
  return `${Math.round((n / of) * 100)}% of seats`;
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-card-border/70 bg-background/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 truncate text-xl font-semibold tabular-nums ${tone ?? ""}`}>
        {value}
      </div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function BillHero({
  bill,
  votes,
  eligible,
  liveDeadline,
  filibustered,
  supermajority,
  myVote,
  onAction,
}: BillHeroProps) {
  const cast = votes.for + votes.against + votes.abstain;
  const typeNames = bill.provisions?.length
    ? bill.provisions.map((p) => p.legislationTypeName).join("; ")
    : bill.legislationTypeName;
  const myVoteLabel =
    myVote === "for"
      ? "Aye"
      : myVote === "against"
        ? "No"
        : myVote === "abstain"
          ? "Abstain"
          : null;
  const coSponsorCount = bill.coSponsors?.length ?? 0;
  const hasActions =
    bill.canCosponsor || bill.canUncosponsor || bill.canWithdraw || bill.canFilibuster;

  return (
    <section className="relative overflow-hidden rounded-xl border border-card-border bg-card shadow-panel">
      <div className={`h-1 w-full ${STATUS_ACCENT[bill.status] ?? "bg-card-border"}`} />
      <div className="space-y-5 p-5 sm:p-6">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={bill.status} />
          {filibustered && (
            <span className="inline-flex items-center gap-1 rounded-full border border-error/40 bg-error/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error">
              ⚑ Filibustered
            </span>
          )}
          <span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] text-muted capitalize">
            {chamberLabel(bill.originChamber)} Bill
          </span>
          <BillProposalChip adminProposed={bill.adminProposed} category={bill.category} />
          {bill.category && (
            <span className="text-[10px] text-muted/60 capitalize">{bill.category}</span>
          )}
          {typeNames && <span className="text-[10px] text-cyan-400/90">{typeNames}</span>}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0 space-y-3">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
              {bill.title}
            </h1>
            {bill.summary && (
              <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted sm:text-base">
                {bill.summary}
              </p>
            )}
            {/* Byline */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>
                Sponsored by{" "}
                {bill.sponsorId ? (
                  <Link
                    href={`/character/${bill.sponsorSequentialId ?? bill.sponsorId}`}
                    className="font-semibold hover:underline"
                    style={{ color: bill.sponsorPartyColor }}
                  >
                    {bill.sponsorName}
                  </Link>
                ) : (
                  <span className="font-semibold">{bill.sponsorName}</span>
                )}
                {bill.sponsorPartyName && (
                  <span className="ml-1" style={{ color: bill.sponsorPartyColor }}>
                    ({bill.sponsorPartyName})
                  </span>
                )}
              </span>
              <span className="text-muted/40">•</span>
              <span>
                Introduced <GameMonthTime value={bill.proposedAt} />
              </span>
              {coSponsorCount > 0 && (
                <>
                  <span className="text-muted/40">•</span>
                  <span>
                    {coSponsorCount} co-sponsor{coSponsorCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>

          {hasActions && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {bill.canCosponsor && (
                <button
                  type="button"
                  onClick={() => onAction("cosponsor")}
                  className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  + Co-sponsor
                </button>
              )}
              {bill.canUncosponsor && (
                <button
                  type="button"
                  onClick={() => onAction("uncosponsor")}
                  className="rounded-lg border border-card-border bg-background px-3 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
                >
                  Remove co-sponsorship
                </button>
              )}
              {bill.canFilibuster && (
                <button
                  type="button"
                  onClick={() => onAction("filibuster")}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  Invoke filibuster
                </button>
              )}
              {bill.canWithdraw && (
                <button
                  type="button"
                  onClick={() => onAction("withdraw")}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Withdraw bill
                </button>
              )}
            </div>
          )}
        </div>

        {/* At a glance */}
        {eligible > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label={chamberLabel(bill.currentChamber)}
              value={
                liveDeadline ? (
                  <span className="text-base">
                    <DeadlineCountdown deadline={liveDeadline} />
                  </span>
                ) : (
                  <span className="text-base">{cast > 0 ? "Vote closed" : "Not voting"}</span>
                )
              }
              sub={myVoteLabel ? `You voted ${myVoteLabel}` : `${eligible} seats`}
            />
            <StatTile
              label="Aye"
              value={votes.for}
              sub={pct(votes.for, eligible)}
              tone="text-success"
            />
            <StatTile
              label="No"
              value={votes.against}
              sub={pct(votes.against, eligible)}
              tone="text-error"
            />
            <StatTile label="Abstain" value={votes.abstain} sub={`${cast} votes cast`} />
          </div>
        )}

        {bill.vetoMessage && (
          <div className="rounded-lg border border-error/40 bg-error/5 px-4 py-3">
            <h2 className="text-sm font-semibold text-error">President&apos;s veto message</h2>
            <p className="mt-1 text-sm italic">&ldquo;{bill.vetoMessage}&rdquo;</p>
          </div>
        )}

        {supermajority && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            This bill transfers state ownership, so it requires a{" "}
            <span className="font-semibold">two-thirds supermajority</span> of votes cast in each
            chamber to pass.
          </div>
        )}
      </div>
    </section>
  );
}
