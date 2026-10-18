"use client";

import type { ReactNode } from "react";
import type {
  OrganizationLegislation,
  ProposalVote,
} from "@/lib/db/types/internationalOrganization";
import {
  dedupeOrganizationVotes,
  requiresUnanimity,
  votesNeeded,
} from "@/lib/internationalOrganizations/resolutionRules";
import type { OrgSummary } from "./orgTypes";
import { VoteButtons } from "./VoteButtons";
import { VoteRoster } from "./VoteRoster";

interface Props {
  legislation: OrganizationLegislation;
  org: OrgSummary;
  viewerCountry: string | null;
  /** War consent uses hasVote; policy resolutions include policy-voting members. */
  electorate: "hasVote" | "hasPolicyVote";
  turnsLeft: number;
  votingWindowTurns: number;
  onVote: (id: string, vote: ProposalVote) => Promise<void>;
  progressClassName?: "bg-primary" | "bg-error" | "bg-success";
  children: ReactNode;
}

/** Common resolution chrome; each panel owns its proposal description and form. */
export function ProposalBallotCard({
  legislation,
  org,
  viewerCountry,
  electorate,
  turnsLeft,
  votingWindowTurns,
  onVote,
  progressClassName = "bg-primary",
  children,
}: Props) {
  const expectedVoters = org.members.filter((member) => member[electorate]).map((m) => m.countryId);
  const viewerIsMember =
    viewerCountry != null && org.members.some((member) => member.countryId === viewerCountry);
  const viewerHoldsVote =
    viewerCountry != null && expectedVoters.some((country) => country === viewerCountry);
  // Match the resolver: fold duplicate ballots before counting eligible votes.
  const votes = dedupeOrganizationVotes(legislation.votes);
  const yesCount = votes.filter(
    (vote) => vote.vote === "yes" && expectedVoters.includes(vote.countryId)
  ).length;
  const myVote =
    viewerCountry != null
      ? (votes.find((vote) => vote.countryId === viewerCountry)?.vote ?? null)
      : null;
  const needed = votesNeeded(legislation.type, expectedVoters.length);
  const progress = needed > 0 ? (yesCount / needed) * 100 : 0;
  const isDeclaration = legislation.type === "declare_war";
  const requirement =
    expectedVoters.length === 0
      ? isDeclaration
        ? "no player nations hold a vote"
        : "no members hold a vote"
      : requiresUnanimity(legislation.type)
        ? isDeclaration
          ? "unanimous player consent required"
          : "unanimous consent required"
        : `${needed} needed`;

  return (
    <article className="rounded-xl border border-card-border bg-card p-5 shadow-card">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>{children}</div>
        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
          Voting
        </span>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            {yesCount} / {expectedVoters.length} {isDeclaration ? "player nations" : "members"} in
            favour, {requirement}
          </span>
          <span className="tabular-nums">
            {votingWindowTurns - turnsLeft}/{votingWindowTurns} turns
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className={`h-full rounded-full ${progressClassName} transition-all duration-500`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
      <VoteButtons
        onVote={(vote) => onVote(legislation._id.toString(), vote)}
        disabled={!viewerHoldsVote}
        disabledReason={
          !viewerHoldsVote
            ? !viewerIsMember
              ? "Only foreign ministers of member states may vote."
              : "Your country holds no vote in this organization."
            : undefined
        }
        currentVote={myVote}
      />
      <VoteRoster votes={legislation.votes} expectedVoters={expectedVoters} />
    </article>
  );
}
