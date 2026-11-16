import type { Db } from "mongodb";
import type { Election, ElectionVoteTally } from "@/lib/db/types";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";
import { parliamentaryGovernmentsCollection } from "@/lib/db/repositories/parliamentaryGovernments";
import {
  CHAMBER_LABELS,
  NATIONAL_AGGREGATION_TYPES,
} from "@/lib/elections/liveResults/computeResults";
import type { CycleAnchorContext } from "@/lib/elections/cycleAnchorContext";
import { resolveElectionYear } from "@/lib/utils/formatters";
import { resolvedSeatsEstimate } from "@/lib/elections/resolvedSeatsEstimate";
import {
  buildPartyRows,
  majoritySeats,
  type ChamberPartyInput,
  type ChamberPartyRow,
} from "@/lib/wiki/rules/electionResults";

export interface WikiPartyInfo {
  name: string;
  abbreviation: string;
  color: string;
}

export interface ChamberGovernment {
  governingPartyName: string | null;
  coalitionPartyNames: string[];
  formationType: string | null;
  primeMinisterName: string | null;
  seatsSupporting: number;
  isMinority: boolean;
}

export interface ChamberResult {
  chamberLabel: string;
  totalSeats: number;
  majority: number;
  totalVotes: number;
  regionCount: number;
  parties: ChamberPartyRow[];
  previous: { label: string; year: number | null } | null;
  government: ChamberGovernment | null;
}

const ENDED: Election["status"][] = ["completed", "resolved"];
const INDEPENDENT: WikiPartyInfo = { name: "Independent", abbreviation: "IND", color: "#9CA3AF" };

/** Election types that fill the same chamber, so one can be compared with another. */
export function sameChamberTypes(electionType: string): string[] {
  const label = CHAMBER_LABELS[electionType];
  if (!label) return [electionType];
  return Object.keys(CHAMBER_LABELS).filter(
    (type) => CHAMBER_LABELS[type] === label && NATIONAL_AGGREGATION_TYPES.has(type)
  );
}

type SiblingRow = Pick<Election, "_id" | "totalSeats">;
type TallyRow = Pick<
  ElectionVoteTally,
  "electionId" | "totalVotes" | "candidateParties" | "seatsEstimate" | "finalized"
>;

/** Pure fold of region tallies into per-party seats and votes. */
export function foldRegionTallies(
  siblings: SiblingRow[],
  tallies: TallyRow[],
  partyInfo: Map<string, WikiPartyInfo>
): { parties: ChamberPartyInput[]; totalSeats: number } {
  const tallyById = new Map(tallies.map((t) => [t.electionId.toString(), t]));
  const seatsByParty = new Map<string, number>();
  const votesByParty = new Map<string, number>();
  let totalSeats = 0;

  for (const sibling of siblings) {
    totalSeats += sibling.totalSeats ?? 0;
    const tally = tallyById.get(sibling._id.toString());
    if (!tally) continue;
    const partyOf = (candidateId: string) => tally.candidateParties?.[candidateId] ?? "independent";
    for (const [candidateId, votes] of Object.entries(tally.totalVotes ?? {})) {
      const party = partyOf(candidateId);
      votesByParty.set(party, (votesByParty.get(party) ?? 0) + votes);
    }
    const seats = resolvedSeatsEstimate(tally, tally.seatsEstimate ?? null) ?? {};
    for (const [candidateId, count] of Object.entries(seats)) {
      if (count <= 0) continue;
      const party = partyOf(candidateId);
      seatsByParty.set(party, (seatsByParty.get(party) ?? 0) + count);
    }
  }

  const partyIds = new Set([...seatsByParty.keys(), ...votesByParty.keys()]);
  const parties = [...partyIds].map((partyId): ChamberPartyInput => {
    const info = partyInfo.get(partyId) ?? INDEPENDENT;
    return {
      partyId,
      name: info.name,
      abbreviation: info.abbreviation,
      color: info.color,
      seats: seatsByParty.get(partyId) ?? 0,
      votes: votesByParty.get(partyId) ?? 0,
    };
  });
  return { parties, totalSeats };
}

async function loadChamberSide(
  db: Db,
  election: Pick<Election, "countryId" | "electionType" | "cycle" | "chamberClass">,
  partyInfo: Map<string, WikiPartyInfo>
) {
  const siblings = await electionsCollection(db)
    .find(
      {
        countryId: election.countryId,
        electionType: election.electionType,
        cycle: election.cycle,
        status: { $in: ENDED },
        ...(election.chamberClass ? { chamberClass: election.chamberClass } : {}),
      },
      { projection: { _id: 1, totalSeats: 1 } }
    )
    .toArray();
  if (siblings.length === 0) return null;

  const tallies = await electionVoteTalliesCollection(db)
    .find({ electionId: { $in: siblings.map((s) => s._id) } })
    .project<TallyRow>({
      electionId: 1,
      totalVotes: 1,
      candidateParties: 1,
      seatsEstimate: 1,
      finalized: 1,
    })
    .toArray();
  return { siblings, ...foldRegionTallies(siblings, tallies, partyInfo) };
}

async function loadGovernment(
  db: Db,
  election: Pick<Election, "countryId" | "cycle">,
  partyInfo: Map<string, WikiPartyInfo>
): Promise<ChamberGovernment | null> {
  const gov = await parliamentaryGovernmentsCollection(db).findOne(
    {
      countryId: election.countryId,
      cycle: election.cycle,
      status: { $in: ["formed", "collapsed"] },
    },
    {
      projection: {
        governingPartyId: 1,
        coalitionPartyIds: 1,
        formationType: 1,
        pmName: 1,
        totalSeatsSupporting: 1,
        isMinority: 1,
      },
    }
  );
  if (!gov?.governingPartyId) return null;
  const nameOf = (id: string) => partyInfo.get(id)?.name ?? null;
  return {
    governingPartyName: nameOf(gov.governingPartyId),
    coalitionPartyNames: (gov.coalitionPartyIds ?? [])
      .map(nameOf)
      .filter((n): n is string => n != null),
    formationType: gov.formationType ?? null,
    primeMinisterName: gov.pmName ?? null,
    seatsSupporting: gov.totalSeatsSupporting,
    isMinority: gov.isMinority,
  };
}

/**
 * Country-wide result for a legislative election, or null when the race is not
 * one of a chamber's regional ballots. Sibling region races share country,
 * type and cycle; the previous result is the latest earlier election of the
 * same chamber (a snap election compares with the general election before it).
 */
export async function loadChamberResult(
  db: Db,
  election: Pick<Election, "countryId" | "electionType" | "cycle" | "chamberClass" | "endTime">,
  partyInfo: Map<string, WikiPartyInfo>,
  anchor: CycleAnchorContext
): Promise<ChamberResult | null> {
  if (!NATIONAL_AGGREGATION_TYPES.has(election.electionType)) return null;
  const current = await loadChamberSide(db, election, partyInfo);
  if (!current || current.siblings.length < 2 || current.totalSeats <= 0) return null;

  const previousElection = election.endTime
    ? await electionsCollection(db).findOne(
        {
          countryId: election.countryId,
          electionType: { $in: sameChamberTypes(election.electionType) },
          status: { $in: ENDED },
          endTime: { $lt: election.endTime },
          // Sibling regions of this very election can end a moment earlier.
          $nor: [{ electionType: election.electionType, cycle: election.cycle }],
          ...(election.chamberClass ? { chamberClass: election.chamberClass } : {}),
        },
        {
          sort: { endTime: -1 },
          projection: {
            countryId: 1,
            electionType: 1,
            cycle: 1,
            chamberClass: 1,
            endTime: 1,
            electionYear: 1,
          },
        }
      )
    : null;
  const previous = previousElection ? await loadChamberSide(db, previousElection, partyInfo) : null;

  const previousYear = previousElection ? resolveElectionYear(previousElection, anchor) : null;
  const parties = buildPartyRows(current.parties, previous ? previous.parties : null);
  const chamberLabel = CHAMBER_LABELS[election.electionType] ?? "Legislature";
  return {
    chamberLabel,
    totalSeats: current.totalSeats,
    majority: majoritySeats(current.totalSeats),
    totalVotes: parties.reduce((sum, p) => sum + p.votes, 0),
    regionCount: current.siblings.length,
    parties,
    previous: previousElection
      ? {
          label: `${previousYear ?? "earlier"} ${chamberLabel} election`,
          year: previousYear,
        }
      : null,
    government: await loadGovernment(db, election, partyInfo),
  };
}

export interface PartySeatPoint {
  year: number | null;
  endTime: string | null;
  seats: number;
  totalSeats: number;
  votePct: number | null;
  /** Seats minus the party's seats at the chamber's previous election. */
  seatChange: number | null;
  /** Snap and by-elections are marked so the chart reads correctly. */
  electionType: string;
}

export interface PartySeatHistory {
  chamberLabel: string;
  points: PartySeatPoint[];
}

interface HistoryElectionRow {
  _id: Election["_id"];
  electionType: string;
  cycle: number;
  chamberClass?: Election["chamberClass"];
  totalSeats?: number;
  endTime?: Date;
  electionYear?: number | null;
}

/**
 * Groups region races into whole-chamber elections and returns one party's
 * seat line per chamber, oldest first. Pure so the grouping can be tested.
 */
export function buildPartySeatHistory(
  partyId: string,
  elections: HistoryElectionRow[],
  tallies: TallyRow[],
  partyInfo: Map<string, WikiPartyInfo>,
  yearOf: (e: HistoryElectionRow) => number | null
): PartySeatHistory[] {
  const groups = new Map<string, HistoryElectionRow[]>();
  for (const e of elections) {
    const key = `${e.electionType}|${e.cycle}|${e.chamberClass ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const byChamber = new Map<string, Array<PartySeatPoint & { sortTime: number }>>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const first = members[0];
    const chamberLabel = CHAMBER_LABELS[first.electionType] ?? "Legislature";
    const { parties, totalSeats } = foldRegionTallies(members, tallies, partyInfo);
    if (totalSeats <= 0) continue;
    const totalVotes = parties.reduce((sum, p) => sum + p.votes, 0);
    const mine = parties.find((p) => p.partyId === partyId);
    const endMs = Math.max(...members.map((m) => m.endTime?.getTime() ?? 0));
    const point = {
      year: yearOf(first),
      endTime: endMs > 0 ? new Date(endMs).toISOString() : null,
      seats: mine?.seats ?? 0,
      totalSeats,
      votePct: totalVotes > 0 ? ((mine?.votes ?? 0) / totalVotes) * 100 : null,
      seatChange: null as number | null,
      electionType: first.electionType,
      sortTime: endMs,
    };
    const list = byChamber.get(chamberLabel);
    if (list) list.push(point);
    else byChamber.set(chamberLabel, [point]);
  }

  const out: PartySeatHistory[] = [];
  for (const [chamberLabel, list] of byChamber) {
    list.sort((a, b) => a.sortTime - b.sortTime);
    // A party that never won a seat or a vote in a chamber has no history there.
    if (!list.some((p) => p.seats > 0 || (p.votePct ?? 0) > 0)) continue;
    const points = list.map(({ sortTime: _sortTime, ...point }, i) => ({
      ...point,
      seatChange: i === 0 ? null : point.seats - list[i - 1].seats,
    }));
    out.push({ chamberLabel, points });
  }
  return out.sort((a, b) => a.chamberLabel.localeCompare(b.chamberLabel));
}

/** Seat history for one party across every chamber election in its country. */
export async function loadPartySeatHistory(
  db: Db,
  countryId: string,
  partyId: string,
  partyInfo: Map<string, WikiPartyInfo>,
  anchor: CycleAnchorContext
): Promise<PartySeatHistory[]> {
  const elections = await electionsCollection(db)
    .find(
      {
        countryId: countryId as Election["countryId"],
        electionType: { $in: [...NATIONAL_AGGREGATION_TYPES] },
        status: { $in: ENDED },
      },
      {
        projection: {
          _id: 1,
          electionType: 1,
          cycle: 1,
          chamberClass: 1,
          totalSeats: 1,
          endTime: 1,
          electionYear: 1,
          countryId: 1,
        },
      }
    )
    .toArray();
  if (elections.length === 0) return [];

  const tallies = await electionVoteTalliesCollection(db)
    .find({ electionId: { $in: elections.map((e) => e._id) } })
    .project<TallyRow>({
      electionId: 1,
      totalVotes: 1,
      candidateParties: 1,
      seatsEstimate: 1,
      finalized: 1,
    })
    .toArray();

  return buildPartySeatHistory(partyId, elections, tallies, partyInfo, (e) =>
    resolveElectionYear(
      { electionType: e.electionType, cycle: e.cycle, electionYear: e.electionYear, countryId },
      anchor
    )
  );
}
