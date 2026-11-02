"use client";

import React from "react";
import dynamic from "next/dynamic";
import { RunningMateSelector } from "./RunningMateSelector";
import { GeneralElectionPanel, GeneralElectionNoTallyPanel } from "./ElectionDetailPanels";
import { GeneralElectionShellClient } from "./GeneralElectionShellClient";
import { buildGeneralElectionViewModel } from "@/lib/elections/generalViewModel";
import { countryHasPresidentialRunningMate } from "@/lib/elections/runningMateEligibility";
import { CampaignSeasonBanner } from "./CampaignSeasonBanner";
import { persuasionDriverProps } from "@/components/elections/general/persuasionDriverProps";
import { NationalMoodGauge } from "@/components/elections/general/NationalMoodGauge";
import { DemocraticHealthGauge } from "@/components/elections/general/DemocraticHealthGauge";
import { FactorLedgerCard } from "@/components/elections/general/FactorLedgerCard";
import { ParticipationLedgerCard } from "@/components/elections/general/ParticipationLedgerCard";
import { RaceDetailTabs, type RaceDetailPane } from "./RaceDetailTabs";
import { StateOrganizationTab } from "@/app/political-operations/components/StateOrganizationTab";
import { GeneralVoteCharts, type LineSeries } from "./ElectionDetailCharts";
import { buildGeneralColors } from "@/lib/utils/politics";
import { states as referenceStates } from "@/lib/seeds/reference/states";
import type { ElectionDetail } from "./ElectionDetailTypes";

/** Static US state-id → display-name map sourced from the reference seed.
 *  Built once at module load — pure data, no runtime cost per render. */
const US_STATE_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  referenceStates.filter((s) => s.countryId === "US").map((s) => [s._id, s.name])
);

const MapLoadingSkeleton = () => (
  <div className="w-full animate-pulse rounded-xl border border-card-border bg-card p-6">
    <div className="h-4 w-32 rounded bg-card-border mb-4" />
    <div className="h-64 rounded-lg bg-card-border/50" />
  </div>
);

const PresidentialMapWithStateDetail = dynamic(
  () =>
    import("./PresidentialMapWithStateDetail").then((m) => ({
      default: m.PresidentialMapWithStateDetail,
    })),
  { ssr: false, loading: MapLoadingSkeleton }
);

interface GeneralPhaseViewProps {
  election: ElectionDetail;
  electionId: string;
  localInPrimary: boolean;
  localIsEnded: boolean;
  amInRace: boolean;
  onSuccess: () => void;
  /**
   * Whether this view states the college standing and the per-ticket numbers
   * itself. False when a caller has already put both above it.
   */
  showCollegeSummary?: boolean;
  /**
   * Fold the presidential detail views — the map, campaign presence, the
   * trends chart, the state drivers and the factor ledger — into one tabbed
   * section rather than stacking them down the page.
   */
  tabbedDetail?: boolean;
  /**
   * With `tabbedDetail`, render only the tabbed detail section and nothing
   * else: the presidential stage already carries the map, the tickets and the
   * tally, and needs just the views it has no room for.
   */
  detailOnly?: boolean;
  /**
   * Whether to draw the National Mood gauge. False where a caller states the
   * same figure and the same components above it.
   */
  showNationalMood?: boolean;
  /** Whether to draw the Democratic Health gauge. */
  showDemocraticHealth?: boolean;
}

export function GeneralPhaseView({
  election,
  electionId,
  localInPrimary,
  localIsEnded,
  amInRace,
  showCollegeSummary = true,
  tabbedDetail = false,
  detailOnly = false,
  showNationalMood = true,
  showDemocraticHealth = true,
  onSuccess,
}: GeneralPhaseViewProps) {
  // Derive country-specific UI gates from the election itself rather than
  // accept them as props. `isUS` drives presidential-only UI (running mate,
  // EC map, etc.); `isProjectedGeneral` drives the "Live Projection" vs
  // "Live Tally" copy — parliamentary lower-chamber elections allocate seats
  // by demographic reach (projected), while presidential / FPTP-per-seat
  // races show a running tally.
  const isUS = election.countryId === "US";
  const isProjectedGeneral = election.countryId !== "US";

  // The running-mate selector is offered for any president-with-VP-ticket
  // country (US, Brazil, Nigeria) — not just the US. Ceremonial presidencies
  // without a VP office (Ireland, China) never show it. See ticket #0957.
  const showRunningMateSelector =
    election.countryId !== "RU" && countryHasPresidentialRunningMate(election.countryId);

  // Persuasion-driver inputs — shared by the presidential shell and the
  // state-race card. All fields are already on the client DTO (support is
  // fogged server-side for non-privileged viewers).
  const { candidates: persuasionCandidates, inputs: persuasionInputs } =
    persuasionDriverProps(election);
  const isPresidentialGeneral =
    election.countryId !== "RU" && election.electionType === "president" && !localInPrimary;

  const isPresidentialRace = election.countryId !== "RU" && election.electionType === "president";
  const hasTrendData = (election.generalVotes?.turnSnapshots?.length ?? 0) > 0;
  const hasStateVotes = Object.keys(election.generalVotes?.stateVoteData ?? {}).length > 0;

  const factorLedger = (
    <FactorLedgerCard
      countryId={election.countryId}
      data={election.factorLedger}
      candidates={Object.entries(election.generalVotes?.candidateNames ?? {}).map(([id, name]) => ({
        id,
        name,
        color: election.generalVotes?.candidateColors?.[id] ?? "#9CA3AF",
      }))}
    />
  );
  const participation = election.generalVotes?.turnSnapshots.at(-1)?.participation;
  const participationLedger = <ParticipationLedgerCard data={participation} />;

  const stateDrivers = (
    <GeneralElectionShellClient
      countryId="US"
      persuasionCandidates={persuasionCandidates}
      persuasionInputs={persuasionInputs}
      viewModel={buildGeneralElectionViewModel({
        candidates: Object.entries(election.generalVotes?.candidateNames ?? {}).map(
          ([id, name]) => {
            const partyId = election.generalVotes?.candidateParties?.[id] ?? "";
            return {
              id,
              name,
              color: election.generalVotes?.candidateColors?.[id] ?? "#9CA3AF",
              partyAbbr: election.partyDisplayById?.[partyId]?.abbr ?? (partyId || "?"),
            };
          }
        ),
        stateVoteData: Object.fromEntries(
          Object.entries(election.generalVotes?.stateVoteData ?? {}).map(([stateId, d]) => [
            stateId,
            d.votesByCandidate,
          ])
        ),
        regByState: election.regByState,
        partyDisplayById: election.partyDisplayById,
        stateNameById: US_STATE_NAME_BY_ID,
      })}
    />
  );

  /**
   * The trend charts, which otherwise sit inside the tally panel further down.
   * Colours come from the same `buildGeneralColors` the panel uses, so the two
   * cannot give one candidate two colours.
   */
  const trends = election.generalVotes ? (
    <div className="rounded-xl border border-card-border bg-card p-4 sm:p-5">
      <GeneralVoteCharts
        snapshots={election.generalVotes.turnSnapshots ?? []}
        series={((): LineSeries[] => {
          const colors = buildGeneralColors(election.allCandidates);
          return election.allCandidates.map((c) => ({
            id: c.id,
            name: c.characterName,
            color: colors.get(c.id) ?? c.partyColor,
          }));
        })()}
        evByTurn={election.generalVotes.evByTurn}
      />
    </div>
  ) : null;

  const detailPanes: RaceDetailPane[] = tabbedDetail
    ? [
        ...(isUS && election.myCharId
          ? [
              {
                id: "presence",
                label: "Campaign presence",
                content: (
                  <StateOrganizationTab showHubLink showHeading={false} needsCampaign={!amInRace} />
                ),
                hash: "#state-org",
              },
            ]
          : []),
        ...(trends && (!localInPrimary || hasTrendData)
          ? [{ id: "trends", label: "Trends", content: trends }]
          : []),
        ...(isUS && (!localInPrimary || hasStateVotes)
          ? [{ id: "drivers", label: "State drivers", content: stateDrivers }]
          : []),
        ...(participation
          ? [{ id: "turnout", label: "Turnout", content: participationLedger }]
          : []),
        ...(!localInPrimary || election.factorLedger
          ? [{ id: "ledger", label: "Factor ledger", content: factorLedger }]
          : []),
      ]
    : [];

  if (tabbedDetail && detailOnly) {
    // The primary phase has its own stage, so this is only the views that have
    // something to say yet: tabs with no data are left out, not shown empty.
    return isPresidentialRace && detailPanes.length > 0 ? (
      <RaceDetailTabs panes={detailPanes} title="Race detail" />
    ) : null;
  }

  return (
    <div className="space-y-4">
      {tabbedDetail && isPresidentialGeneral ? (
        <RaceDetailTabs panes={detailPanes} title="Race detail" />
      ) : null}

      {/* The electoral map leads the presidential page, directly under the
          year + race title. It is the one view that answers "who is winning"
          at a glance, and it used to sit below the mood gauge, the factor
          ledger and the battleground shell: three analysis cards that only
          make sense once you have seen the map they decompose. */}
      {!tabbedDetail && isUS && election.electionType === "president" && !localInPrimary && (
        <PresidentialMapWithStateDetail
          electionId={electionId}
          electoralMapData={election.generalVotes?.electoralMapData ?? {}}
          electoralVotesByCandidate={election.generalVotes?.electoralVotesByCandidate}
          candidateNames={election.generalVotes?.candidateNames ?? {}}
          candidateParties={election.generalVotes?.candidateParties ?? {}}
          candidateColors={election.generalVotes?.candidateColors ?? {}}
          stateVoteData={election.generalVotes?.stateVoteData}
          stateVotesOverTime={election.generalVotes?.stateVotesOverTime}
          candidateTravelStates={Object.fromEntries(
            election.allCandidates.filter((c) => c.travelState).map((c) => [c.id, c.travelState!])
          )}
        />
      )}

      {/* Naming a running mate belongs to running a campaign, and the campaign
          page carries the same control against the same route. On the folded
          layout this was a second entry point to it, sitting between two
          analysis views that have nothing to do with managing a ticket. */}
      {!tabbedDetail &&
        showRunningMateSelector &&
        election.electionType === "president" &&
        amInRace &&
        !localIsEnded &&
        (() => {
          const myCandidate = election.allCandidates.find((c) => c.isYou);
          return myCandidate ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <RunningMateSelector
                electionId={electionId}
                currentRunningMateCharacterId={myCandidate.runningMateCharacterId ?? null}
                currentRunningMateName={myCandidate.runningMateName ?? null}
                onSuccess={onSuccess}
              />
            </div>
          ) : null;
        })()}

      <div className="space-y-3">
        <CampaignSeasonBanner
          election={election}
          localInPrimary={localInPrimary}
          localIsEnded={localIsEnded}
        />

        {/* Names the tally table it introduces, so it is dropped alongside it
            rather than left heading a section with no tally under it. */}
        {showCollegeSummary && (
          <div>
            <h2 className="text-lg font-semibold">
              {localIsEnded
                ? "Final election results"
                : isProjectedGeneral
                  ? "General election — Live projection"
                  : "General election — Live tally"}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {isProjectedGeneral
                ? "Seats projected by demographic reach and regional support each turn."
                : "Votes allocated by demographic reach each turn. Final 4 turns = 25%; earlier turns = 75%."}
            </p>
          </div>
        )}

        {/* National Mood — the economy's push on the incumbent party, read off
            the tally snapshot the engine wrote. Sits with the driver panels so
            the national channel is visible before election day. Renders for the
            live race and for resolved races that carry the snapshot; older
            races have no field and the card returns null. */}
        {showNationalMood && election.electionType === "president" && !localInPrimary && (
          <NationalMoodGauge data={election.economicReferendum} />
        )}

        {/* Democratic Health: institutional strain affects the ruling party's
            presidential candidates, with the larger personal drag shown for
            the sitting President when they are in the race. */}
        {showDemocraticHealth && election.electionType === "president" && !localInPrimary && (
          <DemocraticHealthGauge data={election.democraticHealth} />
        )}

        {!tabbedDetail && !localInPrimary && participationLedger}

        {/* Factor Ledger — the read-only decomposition of each candidate's
            projected votes into named factors, teed off the engine's own math.
            Renders null for races with no ledger. */}
        {!tabbedDetail && election.electionType === "president" && !localInPrimary && factorLedger}

        {!tabbedDetail && isUS && election.electionType === "president" && !localInPrimary
          ? stateDrivers
          : null}

        {election.generalVotes ? (
          <GeneralElectionPanel
            tally={election.generalVotes}
            candidates={election.allCandidates}
            isEnded={localIsEnded}
            electionType={election.electionType}
            electionId={election.id}
            myCharId={election.myCharId}
            myEndorsedCandidateId={election.myEndorsedCandidateId}
            countryId={(election.countryId ?? "US") as "US" | "UK" | "DE"}
            showCollegeSummary={showCollegeSummary}
            showTrends={!tabbedDetail}
          />
        ) : (
          <GeneralElectionNoTallyPanel
            candidates={election.allCandidates}
            isEnded={localIsEnded}
            totalSeats={election.totalSeats}
            electionId={election.id}
            electionType={election.electionType}
            myCharId={election.myCharId}
            myEndorsedCandidateId={election.myEndorsedCandidateId}
          />
        )}
      </div>
    </div>
  );
}
