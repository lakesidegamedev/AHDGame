"use client";

import React from "react";
import { SectionLabel } from "@/components/ui";
import { PresidentialMapWithStateDetail } from "@/app/elections/[id]/components/PresidentialMapWithStateDetail";
import { isContingentResolutionMode } from "@/lib/elections/presidentialResolutionDisplay";
import { stateWinnerRows } from "@/lib/wiki/rules/electionResults";
import { formatPct } from "../wikiElectionHelpers";
import type { GeneralResults } from "../wikiElectionTypes";

interface ElectoralCollegeAnalysisProps {
  electionId: string;
  generalResults: GeneralResults;
  totalVotes: number;
}

/** Prose analysis section rendered inside the article (with map). */
export function ElectoralCollegeAnalysis({
  electionId,
  generalResults,
  totalVotes,
}: ElectoralCollegeAnalysisProps) {
  if (!generalResults.electoralVotesByCandidate) return null;

  const evValues = Object.values(generalResults.electoralVotesByCandidate).sort((a, b) => b - a);
  const evMarginIsClose = evValues.length >= 2 && evValues[0] - evValues[1] < 50;
  const isContingent = isContingentResolutionMode(generalResults.resolutionMode);
  const contingent = generalResults.contingentResult;
  const presidentWinnerName = contingent
    ? (generalResults.candidateNames[contingent.presidentWinnerId] ?? contingent.presidentWinnerId)
    : null;
  const houseWinnerVotes = contingent
    ? (contingent.houseVoteTotals[contingent.presidentWinnerId] ?? 0)
    : 0;

  return (
    <section className="mb-8">
      <h2 className="mb-4 scroll-mt-24 border-b border-card-border pb-2 text-heading font-semibold text-foreground">
        Electoral College analysis
      </h2>

      {generalResults.electoralMapData && (
        <div className="mb-6">
          <PresidentialMapWithStateDetail
            electionId={electionId}
            electoralMapData={generalResults.electoralMapData}
            electoralVotesByCandidate={generalResults.electoralVotesByCandidate}
            candidateNames={generalResults.candidateNames}
            candidateParties={generalResults.candidateParties}
            stateVoteData={generalResults.stateVoteData}
            stateVotesOverTime={generalResults.stateVotesOverTime}
          />
        </div>
      )}

      {isContingent && contingent && presidentWinnerName ? (
        <>
          <p className="mb-4 leading-relaxed text-muted">
            No presidential candidate reached the 270 electoral votes required for an outright
            victory. Under the 12th Amendment, the House of Representatives elected the President
            from the top three Electoral College finishers, casting one vote per state delegation.
            The District of Columbia participates in the Electoral College but does not vote in the
            House contingent ballot.
          </p>
          <p className="mb-4 leading-relaxed text-muted">
            <strong className="text-foreground">{presidentWinnerName}</strong> was seated after
            winning {houseWinnerVotes} state delegation vote{houseWinnerVotes === 1 ? "" : "s"} on
            the House ballot, despite finishing with{" "}
            {generalResults.electoralVotesByCandidate?.[contingent.presidentWinnerId] ?? 0}{" "}
            electoral votes in the November tally.
            {Object.keys(contingent.senateVoteTotals).length > 0 &&
              contingent.vicePresidentWinnerId &&
              ` The Senate separately elected a Vice President from the top two running mates.`}
            {contingent.deadlockBreakerUsed &&
              " A deterministic deadlock breaker resolved an unresolved chamber ballot."}
          </p>
        </>
      ) : (
        <>
          <p className="mb-4 leading-relaxed text-muted">
            The Electoral College system, enshrined in the Constitution, proved decisive in
            determining the presidency. Each state&apos;s electoral votes were awarded to the
            candidate who won the popular vote within that state, following the winner-take-all
            principle used by most states (Maine and Nebraska being the notable exceptions, which
            allocate electoral votes by congressional district).
          </p>
          <p className="mb-4 leading-relaxed text-muted">
            The final tally demonstrated{" "}
            {evMarginIsClose
              ? "a closely divided nation with competitive results across multiple swing states. The narrow margin in electoral votes reflected the polarized political landscape and the importance of strategic campaigning in battleground states. The outcome hinged on a handful of competitive states where both major candidates invested significant resources."
              : "a clear electoral mandate with decisive victories in key battleground states. The winning candidate's coalition proved strong enough to capture both reliably partisan states and crucial swing states, resulting in a comfortable margin in the Electoral College."}
          </p>
        </>
      )}
      {totalVotes > 0 && (
        <p className="mb-4 leading-relaxed text-muted">
          While the Electoral College determined the presidency, the popular vote provided
          additional context for understanding voter preferences nationwide. The relationship
          between the popular vote distribution and the electoral vote outcome illustrated the
          distinctive features of the American electoral system.
        </p>
      )}
    </section>
  );
}

interface ElectoralCollegeTableProps {
  generalResults: GeneralResults;
}

/** Data table section rendered outside the article prose block. */
export function ElectoralCollegeTable({ generalResults }: ElectoralCollegeTableProps) {
  if (!generalResults.electoralVotesByCandidate) return null;
  if (Object.keys(generalResults.electoralVotesByCandidate).length === 0) return null;

  const isContingent = isContingentResolutionMode(generalResults.resolutionMode);

  return (
    <section className="mb-10 ">
      <SectionLabel as="h3">Electoral College results</SectionLabel>
      <p className="mb-4 text-body text-muted">
        {isContingent
          ? "270 electoral votes needed for an outright win. This race was decided by a House contingent ballot after no candidate reached a majority."
          : "270 electoral votes needed to win. Winner-take-all per state (Maine and Nebraska allocate by congressional district)."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-card-border text-left">
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Candidate
              </th>
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Party
              </th>
              <th className="border-b border-card-border py-1.5 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Electoral votes
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(generalResults.electoralVotesByCandidate)
              .sort(([, a], [, b]) => b - a)
              .map(([candId, ev]) => {
                const name = generalResults.candidateNames[candId] ?? candId;
                const party = generalResults.candidateParties[candId] ?? "";
                return (
                  <tr
                    key={candId}
                    className="border-b border-card-border/50 last:border-0 hover:bg-card-elevated/30 transition-colors"
                  >
                    <td className="border-b border-card-border/60 py-2 pr-4 font-medium text-foreground">
                      {name}
                    </td>
                    <td className="border-b border-card-border/60 py-2 pr-4 text-muted">{party}</td>
                    <td className="border-b border-card-border/60 py-2 font-medium text-foreground">
                      {ev}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** State by state winners, from the frozen per-state vote data. */
export function StateWinnersTable({ generalResults }: { generalResults: GeneralResults }) {
  if (!generalResults.stateVoteData) return null;
  const rows = stateWinnerRows(generalResults.stateVoteData);
  if (rows.length === 0) return null;

  return (
    <section className="mb-10 ">
      <SectionLabel as="h3">Results by state</SectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-card-border text-left">
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                State
              </th>
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Winner
              </th>
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Share
              </th>
              <th className="border-b border-card-border py-1.5 pr-4 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Margin
              </th>
              <th className="border-b border-card-border py-1.5 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
                Electoral votes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = row.winnerId
                ? (generalResults.candidateNames[row.winnerId] ?? row.winnerId)
                : "No votes";
              const party = row.winnerId ? generalResults.candidateParties[row.winnerId] : null;
              return (
                <tr key={row.stateId} className="border-b border-card-border/50 last:border-0">
                  <td className="border-b border-card-border/60 py-2 pr-4 font-medium text-foreground">
                    {row.stateId}
                  </td>
                  <td className="border-b border-card-border/60 py-2 pr-4 text-muted">
                    {name}
                    {party ? ` (${party})` : ""}
                  </td>
                  <td className="border-b border-card-border/60 py-2 pr-4 tabular-nums text-muted">
                    {row.winnerPct == null ? "" : formatPct(row.winnerPct)}
                  </td>
                  <td className="border-b border-card-border/60 py-2 pr-4 tabular-nums text-muted">
                    {row.marginPct == null ? "" : `${row.marginPct.toFixed(1)} pts`}
                  </td>
                  <td className="border-b border-card-border/60 py-2 tabular-nums text-foreground">
                    {row.electoralVotes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
