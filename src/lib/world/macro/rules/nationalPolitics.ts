/**
 * National politics for background countries.
 *
 * A background country has no NPP politicians, no regional elections and no
 * bill lifecycle: just a ruling party or coalition, an aging head of government,
 * an approval rating, and a term-limited national election (or a snap election
 * after sustained low approval).
 *
 * Each tick: economy read against expectations (Okun growth gap, budget-driven
 * inflation); approval drifts toward the economy target minus fatigue and
 * consolidation cost; election shifts party vote shares with seeded swing,
 * founding/folding/protest rules and shared seat allocators.
 *
 * Pure: plain data in, plain data out; rng and turn/year are injected.
 */
import { largestRemainderSeats } from "@/lib/elections/resolution/seatAllocation";
import { allocateViaSainteLague } from "@/lib/elections/resolution/sainteLagueAllocation";
import {
  electorateCentre,
  FOLD_VOTE_SHARE,
  FOUNDING_GAP_MATCH,
  foundingPartyName,
  ideologyAnchors,
  ideologyDistance,
  ideologyGaps,
  planFolds,
  renewalAbbreviation,
  renewalColor,
  type IdeologyPoint,
  type RenewalCycleSnapshot,
} from "@/lib/parties/rules/partyRenewal";
import type { BackgroundConstitution } from "./backgroundConstitution";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Share of the gap to the approval target closed each kernel tick. */
export const APPROVAL_ADJUSTMENT = 0.2;
/** Approval with a normal economy and a fresh government. */
export const APPROVAL_BASELINE = 50;
/** Approval points per point of growth above expectations. */
export const APPROVAL_PER_GROWTH_POINT = 2;
/** Approval points lost per point of inflation above the tolerance. */
export const APPROVAL_PER_INFLATION_POINT = 1.5;
/** Inflation (percent) voters tolerate before it costs the government. */
export const INFLATION_TOLERANCE = 3;
/** Approval points lost per point of unemployment above its natural rate. */
export const APPROVAL_PER_UNEMPLOYMENT_POINT = 2;
/** Approval points lost per term served after the first. */
export const FATIGUE_APPROVAL_PER_TERM = 4;
/**
 * Approval points per point of the stabilizer's approval cost. That cost is
 * scaled for a full country's composite approval; a background government's
 * own rating swings harder, so one package of 4 points costs it 12.
 */
export const AUSTERITY_APPROVAL_MULTIPLIER = 3;
/** Largest per-tick noise on approval, either way. */
export const APPROVAL_NOISE = 1.5;

/** Approval under which the government is in trouble. */
export const SNAP_APPROVAL_CEILING = 30;
/** Consecutive kernel ticks under the ceiling that force a snap election. */
export const SNAP_LOW_APPROVAL_TICKS = 4;
/** Approval under which a protest party can enter at an election. */
export const PROTEST_APPROVAL_CEILING = 25;

/** Log-share swing for governing parties per approval point away from the baseline. */
export const INCUMBENT_SWING_PER_APPROVAL = 0.006;
/** Log-share swing for governing parties per point of the economic score. */
export const INCUMBENT_SWING_PER_ECONOMY = 0.004;
/** Log-share loss for governing parties per term served after the first. */
export const FATIGUE_SWING_PER_TERM = 0.04;
/** Scale of the seeded per-party swing (log share). */
export const RANDOM_SWING = 0.15;

/** Vote share a new party starts with, taken evenly from everyone else. */
export const FOUNDED_PARTY_SHARE = 0.05;
/** Vote share a protest party starts with. */
export const PROTEST_PARTY_SHARE = 0.08;

/** Seat-share exponent for single-member districts modelled nationally. */
export const DISTRICT_SEAT_EXPONENT = 2;

/** A head of government always retires at this age. */
export const LEADER_RETIREMENT_AGE = 76;
/** From this age a head of government may retire at any tick. */
export const LEADER_LATE_CAREER_AGE = 68;
/** Chance per tick of retirement after the late-career age. */
export const LEADER_RETIREMENT_CHANCE = 0.04;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NationalParty extends IdeologyPoint {
  /** Seeded party document id, or a background id for a party founded later. */
  partyId: string;
  name: string;
  abbreviation: string;
  color: string;
  voteShare: number;
  seats: number;
  active: boolean;
  /** Turn a party founded by this model entered. Absent on seeded parties. */
  foundedTurn?: number;
}

export interface HeadOfGovernment {
  name: string;
  partyId: string;
  birthYear: number;
  sinceYear: number;
}

export interface NationalElectionResult {
  turn: number;
  year: number;
  snap: boolean;
  results: { partyId: string; voteShare: number; seats: number }[];
  governmentPartyIds: string[];
  governmentChanged: boolean;
}

export interface NationalEconomyReading {
  /** Aggregate output at the last reading (same units as the macro sectors). */
  output: number;
  turn: number;
  /** Annual real growth, percent. */
  growth: number;
  /** Annual inflation, percent. */
  inflation: number;
  /** Unemployment, percent. */
  unemployment: number;
}

export interface NationalPoliticsState {
  parties: NationalParty[];
  /** Governing parties, the leading party first. */
  governmentPartyIds: string[];
  head: HeadOfGovernment;
  /** Consecutive terms the leading party has governed. */
  termsServed: number;
  /** Government approval, 0-100. */
  approval: number;
  /** Consecutive ticks under {@link SNAP_APPROVAL_CEILING}. */
  lowApprovalTicks: number;
  lastElectionTurn: number | null;
  nextElectionTurn: number;
  lastElection: NationalElectionResult | null;
  /** Ideological slots no party reached at the last two elections, oldest first. */
  gapHistory: IdeologyPoint[][];
  economy: NationalEconomyReading;
  /** Turn of the last consolidation package whose approval cost was taken. */
  austerityAppliedTurn: number | null;
  /** Parties this model has founded, for unique ids. */
  foundedCount: number;
}

export interface NamePool {
  firstNames: readonly string[];
  surnames: readonly string[];
  surnameFirst?: boolean;
}

export interface SeedParty extends IdeologyPoint {
  partyId: string;
  name: string;
  abbreviation: string;
  color: string;
  /** Relative strength from the seed; non-positive means unknown. */
  strength: number;
}

export interface NationalExpectations {
  /** Annual trend growth as a fraction (0.02 = 2%). */
  trendGrowth: number;
  /** Natural unemployment, percent. */
  naturalUnemployment: number;
}

export type NationalPoliticsEvent =
  | { kind: "election"; result: NationalElectionResult }
  | { kind: "leaderReplaced"; previous: HeadOfGovernment; next: HeadOfGovernment; reason: string }
  | { kind: "partyFounded"; partyId: string; name: string }
  | { kind: "partyFolded"; partyId: string; intoPartyId: string };

export interface NationalPoliticsTickInput {
  countryId: string;
  constitution: BackgroundConstitution;
  turn: number;
  year: number;
  turnsPerYear: number;
  /** Aggregate output now. */
  output: number;
  /** Annual inflation now, percent. */
  inflation: number;
  expectations: NationalExpectations;
  /** The latest consolidation package, if any. */
  austerity: { approvalCost: number; turn: number } | null;
  namePool: NamePool;
  rng: () => number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const finite = (value: number | null | undefined, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

const round = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

/** Approximately normal draw in [-1.5, 1.5] with a standard deviation of 0.5. */
function centredDraw(rng: () => number): number {
  return rng() + rng() + rng() - 1.5;
}

function normalizeShares(parties: NationalParty[]): void {
  const active = parties.filter((p) => p.active);
  const total = active.reduce((sum, p) => sum + Math.max(0, p.voteShare), 0);
  for (const party of parties) {
    party.voteShare = party.active && total > 0 ? Math.max(0, party.voteShare) / total : 0;
  }
}

/** A head of government's name from the country's pool. */
export function leaderName(pool: NamePool, rng: () => number): string {
  const first = pool.firstNames[Math.floor(rng() * pool.firstNames.length)] ?? "Alex";
  const last = pool.surnames[Math.floor(rng() * pool.surnames.length)] ?? "Morgan";
  return pool.surnameFirst ? `${last} ${first}` : `${first} ${last}`;
}

function newLeader(
  partyId: string,
  year: number,
  pool: NamePool,
  rng: () => number,
  avoid: string | null
): HeadOfGovernment {
  let name = leaderName(pool, rng);
  for (let attempt = 0; attempt < 3 && avoid !== null && name === avoid; attempt++) {
    name = leaderName(pool, rng);
  }
  return { name, partyId, birthYear: year - (45 + Math.floor(rng() * 18)), sinceYear: year };
}

// ─── Economy ──────────────────────────────────────────────────────────────────

/**
 * The economy as voters see it this tick. Growth is annualised from the change
 * in output since the last reading; unemployment closes half the gap each tick
 * toward the natural rate less half the growth surplus.
 */
export function readNationalEconomy(
  previous: NationalEconomyReading | null,
  input: {
    output: number;
    turn: number;
    inflation: number;
    turnsPerYear: number;
    expectations: NationalExpectations;
  }
): NationalEconomyReading {
  const trend = finite(input.expectations.trendGrowth) * 100;
  const natural = finite(input.expectations.naturalUnemployment, 6);
  let growth = previous ? previous.growth : trend;
  if (previous && previous.output > 0 && input.output > 0 && input.turn > previous.turn) {
    const years = (input.turn - previous.turn) / Math.max(1, input.turnsPerYear);
    growth = ((input.output / previous.output) ** (1 / years) - 1) * 100;
  }
  growth = clamp(growth, -30, 30);
  const target = clamp(natural - 0.5 * (growth - trend), 2, 35);
  const unemployment = previous
    ? previous.unemployment + 0.5 * (target - previous.unemployment)
    : target;
  return {
    output: input.output,
    turn: input.turn,
    growth: round(growth, 2),
    inflation: round(finite(input.inflation, 2), 2),
    unemployment: round(unemployment, 2),
  };
}

/**
 * The economy against expectations, in approval points: growth above trend
 * helps, inflation above tolerance and unemployment above its natural rate hurt.
 */
export function economicScore(
  economy: NationalEconomyReading,
  expectations: NationalExpectations
): number {
  const growthGap = economy.growth - finite(expectations.trendGrowth) * 100;
  const inflationExcess = Math.max(0, economy.inflation - INFLATION_TOLERANCE);
  const unemploymentGap = economy.unemployment - finite(expectations.naturalUnemployment, 6);
  return (
    APPROVAL_PER_GROWTH_POINT * growthGap -
    APPROVAL_PER_INFLATION_POINT * inflationExcess -
    APPROVAL_PER_UNEMPLOYMENT_POINT * unemploymentGap
  );
}

/** The approval the government drifts toward. */
export function approvalTarget(score: number, termsServed: number, austerityPenalty = 0): number {
  const fatigue = FATIGUE_APPROVAL_PER_TERM * Math.max(0, termsServed - 1);
  return clamp(APPROVAL_BASELINE + score - fatigue - Math.max(0, austerityPenalty), 5, 90);
}

/**
 * Approval points a consolidation package still weighs on the government
 * `turnsSince` turns after it was enacted: the full scaled cost at first,
 * fading to nothing over a game year (as the stabilizer's modifier does for
 * full countries).
 */
export function austerityPenalty(
  approvalCost: number,
  turnsSince: number,
  turnsPerYear: number
): number {
  if (!(approvalCost > 0) || turnsSince < 0 || turnsSince >= turnsPerYear) return 0;
  return approvalCost * AUSTERITY_APPROVAL_MULTIPLIER * (1 - turnsSince / turnsPerYear);
}

// ─── Seats and government ─────────────────────────────────────────────────────

/** D'Hondt highest averages: each seat goes to the largest votes / (seats won + 1). */
function dhondtSeats(
  votes: readonly { partyId: string; votes: number }[],
  seats: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of votes) out[v.partyId] = 0;
  for (let n = 0; n < seats; n++) {
    let best: string | null = null;
    let bestQuotient = -1;
    for (const v of votes) {
      const quotient = v.votes / (out[v.partyId] + 1);
      if (
        quotient > bestQuotient ||
        (quotient === bestQuotient && best !== null && v.partyId < best)
      ) {
        best = v.partyId;
        bestQuotient = quotient;
      }
    }
    if (best === null) break;
    out[best] += 1;
  }
  return out;
}

function proportionalSeats(
  shares: readonly { partyId: string; voteShare: number }[],
  seats: number,
  method: "pr_hareQuota" | "pr_dhondt" | "pr_sainteLague",
  threshold: number
): Record<string, number> {
  const votes = shares.map((s) => ({ partyId: s.partyId, votes: Math.round(s.voteShare * 1e7) }));
  const total = votes.reduce((sum, v) => sum + v.votes, 0);
  if (seats <= 0 || total <= 0) return {};
  if (method === "pr_sainteLague") {
    return allocateViaSainteLague(votes, seats, { minVoteShare: threshold }).partySeats;
  }
  if (method === "pr_dhondt") {
    const eligible = new Set(
      votes.filter((v) => v.votes / total >= threshold).map((v) => v.partyId)
    );
    if (eligible.size === 0) for (const v of votes) eligible.add(v.partyId);
    return dhondtSeats(
      votes.filter((v) => eligible.has(v.partyId)),
      seats
    );
  }
  return largestRemainderSeats(
    votes.map((v) => ({ id: v.partyId, votes: v.votes, party: v.partyId })),
    seats,
    { minShare: threshold, totalVotesForShare: total }
  ).seats;
}

/**
 * Seats per party for one national election. Proportional methods use the
 * shared allocators with the country's legal threshold; single-member
 * districts are modelled nationally as a winner's bonus (seat share follows
 * vote share squared), and mixed systems elect half the chamber each way.
 */
export function allocateNationalSeats(
  shares: readonly { partyId: string; voteShare: number }[],
  constitution: Pick<BackgroundConstitution, "seats" | "method" | "threshold">
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of shares) out[s.partyId] = 0;
  const add = (seats: Record<string, number>) => {
    for (const [id, n] of Object.entries(seats)) out[id] = (out[id] ?? 0) + n;
  };
  const districtShares = shares.map((s) => ({
    partyId: s.partyId,
    voteShare: Math.max(0, s.voteShare) ** DISTRICT_SEAT_EXPONENT,
  }));
  const { seats, method, threshold } = constitution;
  if (method === "fptp") {
    add(proportionalSeats(districtShares, seats, "pr_hareQuota", 0));
  } else if (method === "mixed") {
    const districtSeats = Math.floor(seats / 2);
    add(proportionalSeats(districtShares, districtSeats, "pr_hareQuota", 0));
    add(proportionalSeats(shares, seats - districtSeats, "pr_hareQuota", threshold));
  } else {
    add(proportionalSeats(shares, seats, method, threshold));
  }
  return out;
}

/**
 * The largest party governs, joined by its nearest parties by ideology until
 * the coalition holds a majority of seats (or nobody is left to ask).
 */
export function formGovernment(parties: readonly NationalParty[], totalSeats: number): string[] {
  const seated = parties
    .filter((p) => p.active && p.seats > 0)
    .sort(
      (a, b) => b.seats - a.seats || b.voteShare - a.voteShare || a.partyId.localeCompare(b.partyId)
    );
  const lead =
    seated[0] ??
    [...parties]
      .filter((p) => p.active)
      .sort((a, b) => b.voteShare - a.voteShare || a.partyId.localeCompare(b.partyId))[0];
  if (!lead) return [];
  const government = [lead.partyId];
  let seats = lead.seats;
  const partners = seated
    .filter((p) => p.partyId !== lead.partyId)
    .sort(
      (a, b) =>
        ideologyDistance(a, lead) - ideologyDistance(b, lead) || a.partyId.localeCompare(b.partyId)
    );
  for (const partner of partners) {
    if (seats * 2 > totalSeats) break;
    government.push(partner.partyId);
    seats += partner.seats;
  }
  return government;
}

/** Vote-weighted economic position of the government on the party grid (-5..+5). */
export function governmentEconomicPosition(state: NationalPoliticsState): number | null {
  let weight = 0;
  let sum = 0;
  for (const id of state.governmentPartyIds) {
    const party = state.parties.find((p) => p.partyId === id);
    if (!party) continue;
    const w = Math.max(party.seats, 1);
    weight += w;
    sum += w * party.economic;
  }
  return weight > 0 ? sum / weight : null;
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/** Turn of the first regular election from `year`, at least a quarter away. */
function firstElectionTurn(
  constitution: BackgroundConstitution,
  turn: number,
  year: number,
  turnsPerYear: number
): number {
  // Elections fall mid-year in the year they are due.
  let years = constitution.nextElectionYear - year;
  while (years < 0) years += constitution.termYears;
  return turn + Math.max(Math.round(turnsPerYear / 4), Math.round((years + 0.5) * turnsPerYear));
}

/**
 * The opening political state from the country's seeded parties: vote shares
 * from seeded strength (equal when unknown), seats from the constitution, the
 * largest party in government with a new head of government.
 */
export function initNationalPolitics(input: {
  constitution: BackgroundConstitution;
  parties: readonly SeedParty[];
  turn: number;
  year: number;
  turnsPerYear: number;
  output: number;
  inflation: number;
  expectations: NationalExpectations;
  namePool: NamePool;
  rng: () => number;
}): NationalPoliticsState | null {
  if (input.parties.length === 0) return null;
  const strengths = input.parties.map((p) => Math.max(0, finite(p.strength)));
  const known = strengths.some((s) => s > 0);
  const parties: NationalParty[] = input.parties.map((p, i) => ({
    partyId: p.partyId,
    name: p.name,
    abbreviation: p.abbreviation,
    color: p.color,
    economic: finite(p.economic),
    social: finite(p.social),
    voteShare: known ? Math.max(strengths[i], 0.005) : 1,
    seats: 0,
    active: true,
  }));
  normalizeShares(parties);
  const seats = allocateNationalSeats(parties, input.constitution);
  for (const party of parties) party.seats = seats[party.partyId] ?? 0;
  const governmentPartyIds = formGovernment(parties, input.constitution.seats);
  const economy = readNationalEconomy(null, {
    output: input.output,
    turn: input.turn,
    inflation: input.inflation,
    turnsPerYear: input.turnsPerYear,
    expectations: input.expectations,
  });
  return {
    parties,
    governmentPartyIds,
    head: newLeader(
      governmentPartyIds[0] ?? parties[0].partyId,
      input.year,
      input.namePool,
      input.rng,
      null
    ),
    termsServed: 1,
    approval: APPROVAL_BASELINE,
    lowApprovalTicks: 0,
    lastElectionTurn: null,
    nextElectionTurn: firstElectionTurn(
      input.constitution,
      input.turn,
      input.year,
      input.turnsPerYear
    ),
    lastElection: null,
    gapHistory: [],
    economy,
    austerityAppliedTurn: null,
    foundedCount: 0,
  };
}

// ─── Election ─────────────────────────────────────────────────────────────────

function snapshotOf(
  cycle: number,
  result: NationalElectionResult | null,
  parties: readonly NationalParty[],
  totalSeats: number
): RenewalCycleSnapshot | null {
  if (!result) return null;
  return {
    cycle,
    governingPartyId: result.governmentPartyIds[0] ?? null,
    approval: null,
    parties: parties.map((p) => {
      const row = result.results.find((r) => r.partyId === p.partyId);
      return {
        partyId: p.partyId,
        voteShare: row?.voteShare ?? 0,
        seatShare: totalSeats > 0 ? (row?.seats ?? 0) / totalSeats : 0,
      };
    }),
    gaps: [],
  };
}

/**
 * Resolve one national election and return the new state with what happened.
 * Mutates nothing it was given.
 */
export function runNationalElection(
  state: NationalPoliticsState,
  input: Pick<
    NationalPoliticsTickInput,
    | "countryId"
    | "constitution"
    | "turn"
    | "year"
    | "turnsPerYear"
    | "expectations"
    | "namePool"
    | "rng"
  > & { snap: boolean }
): { state: NationalPoliticsState; events: NationalPoliticsEvent[] } {
  const events: NationalPoliticsEvent[] = [];
  const parties: NationalParty[] = state.parties.map((p) => ({ ...p }));
  const governing = new Set(state.governmentPartyIds);
  const score = economicScore(state.economy, input.expectations);

  // Vote shares: previous share, moved by approval, the economy, fatigue and a seeded swing.
  const incumbentSwing =
    INCUMBENT_SWING_PER_APPROVAL * (state.approval - APPROVAL_BASELINE) +
    INCUMBENT_SWING_PER_ECONOMY * score -
    FATIGUE_SWING_PER_TERM * Math.max(0, state.termsServed - 1);
  for (const party of parties) {
    if (!party.active) continue;
    const swing =
      (governing.has(party.partyId) ? incumbentSwing : 0) + RANDOM_SWING * centredDraw(input.rng);
    party.voteShare = Math.max(party.voteShare, 0.002) * Math.exp(swing);
  }
  normalizeShares(parties);

  // Entry: an ideological slot empty at the last election and still empty
  // now, or a protest party against a very unpopular government.
  const active = parties.filter((p) => p.active);
  const shares = new Map(active.map((p) => [p.partyId, p.voteShare]));
  const gaps = ideologyGaps(ideologyAnchors(electorateCentre(active, shares)), active);
  const previousGaps = state.gapHistory[state.gapHistory.length - 1] ?? [];
  const persistent = gaps.find((gap) =>
    previousGaps.some((g) => ideologyDistance(g, gap) <= FOUNDING_GAP_MATCH)
  );
  const lead = parties.find((p) => p.partyId === state.governmentPartyIds[0]) ?? null;
  let entry: { position: IdeologyPoint; share: number } | null = null;
  if (persistent) {
    entry = { position: persistent, share: FOUNDED_PARTY_SHARE };
  } else if (state.approval < PROTEST_APPROVAL_CEILING && lead) {
    const anchors = ideologyAnchors(electorateCentre(active, shares));
    const farthest = [...anchors].sort(
      (a, b) => ideologyDistance(b, lead) - ideologyDistance(a, lead)
    )[0];
    if (farthest) entry = { position: farthest, share: PROTEST_PARTY_SHARE };
  }
  let foundedCount = state.foundedCount;
  if (entry) {
    foundedCount += 1;
    const names = parties.map((p) => p.name);
    const name = foundingPartyName(entry.position, names);
    const founded: NationalParty = {
      partyId: `bg-${input.countryId}-${foundedCount}`,
      name,
      abbreviation: renewalAbbreviation(
        name,
        parties.map((p) => p.abbreviation)
      ),
      color: renewalColor(
        parties.map((p) => p.color),
        foundedCount
      ),
      economic: entry.position.economic,
      social: entry.position.social,
      voteShare: 0,
      seats: 0,
      active: true,
      foundedTurn: input.turn,
    };
    for (const party of parties) party.voteShare *= 1 - entry.share;
    founded.voteShare = entry.share;
    parties.push(founded);
    events.push({ kind: "partyFounded", partyId: founded.partyId, name });
  }

  // Seats and government.
  const seats = allocateNationalSeats(
    parties.filter((p) => p.active),
    input.constitution
  );
  for (const party of parties) party.seats = party.active ? (seats[party.partyId] ?? 0) : 0;
  const governmentPartyIds = formGovernment(parties, input.constitution.seats);
  const result: NationalElectionResult = {
    turn: input.turn,
    year: input.year,
    snap: input.snap,
    results: parties
      .filter((p) => p.active)
      .map((p) => ({
        partyId: p.partyId,
        voteShare: round(p.voteShare, 4),
        seats: p.seats,
      })),
    governmentPartyIds,
    governmentChanged: governmentPartyIds[0] !== state.governmentPartyIds[0],
  };
  events.push({ kind: "election", result });

  // Fold: under 2% at this election and the one before, into the nearest party.
  const previous = snapshotOf(0, state.lastElection, parties, input.constitution.seats);
  const latest = snapshotOf(1, result, parties, input.constitution.seats);
  if (previous && latest) {
    const folds = planFolds(
      previous,
      latest,
      parties
        .filter((p) => p.active)
        .map((p) => ({
          partyId: p.partyId,
          name: p.name,
          abbreviation: p.abbreviation,
          color: p.color,
          economic: p.economic,
          social: p.social,
          renewable: !governmentPartyIds.includes(p.partyId),
        }))
    );
    for (const fold of folds) {
      const from = parties.find((p) => p.partyId === fold.partyId);
      const into = parties.find((p) => p.partyId === fold.targetPartyId);
      if (!from || !into || from.voteShare >= FOLD_VOTE_SHARE) continue;
      into.voteShare += from.voteShare;
      into.seats += from.seats;
      from.voteShare = 0;
      from.seats = 0;
      from.active = false;
      events.push({ kind: "partyFolded", partyId: from.partyId, intoPartyId: into.partyId });
    }
  }

  // Head of government: a new government brings a new leader; a returning one keeps theirs.
  let head = state.head;
  const leadId = governmentPartyIds[0] ?? state.head.partyId;
  if (result.governmentChanged || head.partyId !== leadId) {
    const next = newLeader(leadId, input.year, input.namePool, input.rng, head.name);
    events.push({ kind: "leaderReplaced", previous: head, next, reason: "election" });
    head = next;
  }

  const termsServed = result.governmentChanged ? 1 : state.termsServed + 1;
  const approval = result.governmentChanged
    ? APPROVAL_BASELINE + 5
    : clamp(state.approval + 5, 0, 100);

  return {
    state: {
      ...state,
      parties,
      governmentPartyIds,
      head,
      termsServed,
      approval: round(approval, 1),
      lowApprovalTicks: 0,
      lastElectionTurn: input.turn,
      nextElectionTurn: input.turn + Math.round(input.constitution.termYears * input.turnsPerYear),
      lastElection: result,
      gapHistory: [...state.gapHistory, gaps].slice(-2),
      foundedCount,
    },
    events,
  };
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/** True when approval has stayed low long enough to bring the government down. */
export function snapElectionDue(
  state: NationalPoliticsState,
  turn: number,
  turnsPerYear: number
): boolean {
  const sinceElection = state.lastElectionTurn === null ? Infinity : turn - state.lastElectionTurn;
  return state.lowApprovalTicks >= SNAP_LOW_APPROVAL_TICKS && sinceElection >= turnsPerYear;
}

/**
 * One kernel tick of national politics: read the economy, move approval, age
 * the head of government, and hold an election when one is due.
 */
export function advanceNationalPolitics(
  state: NationalPoliticsState,
  input: NationalPoliticsTickInput
): { state: NationalPoliticsState; events: NationalPoliticsEvent[] } {
  const events: NationalPoliticsEvent[] = [];
  const economy = readNationalEconomy(state.economy, {
    output: input.output,
    turn: input.turn,
    inflation: input.inflation,
    turnsPerYear: input.turnsPerYear,
    expectations: input.expectations,
  });
  const score = economicScore(economy, input.expectations);

  // Approval: toward the economy's target, which a consolidation package holds
  // down for a year; the package also costs its full weight the tick it lands.
  let austerityAppliedTurn = state.austerityAppliedTurn;
  let austerityHit = 0;
  if (
    input.austerity &&
    input.austerity.approvalCost > 0 &&
    (austerityAppliedTurn === null || input.austerity.turn > austerityAppliedTurn)
  ) {
    austerityHit = input.austerity.approvalCost * AUSTERITY_APPROVAL_MULTIPLIER;
    austerityAppliedTurn = input.austerity.turn;
  }
  const target = approvalTarget(
    score,
    state.termsServed,
    input.austerity
      ? austerityPenalty(
          input.austerity.approvalCost,
          input.turn - input.austerity.turn,
          input.turnsPerYear
        )
      : 0
  );
  const approval = clamp(
    state.approval +
      APPROVAL_ADJUSTMENT * (target - state.approval) -
      austerityHit +
      APPROVAL_NOISE * (2 * input.rng() - 1),
    0,
    100
  );
  let next: NationalPoliticsState = {
    ...state,
    economy,
    approval: round(approval, 1),
    lowApprovalTicks: approval < SNAP_APPROVAL_CEILING ? state.lowApprovalTicks + 1 : 0,
    austerityAppliedTurn,
  };

  // The head of government ages and retires; the leading party picks a successor.
  const age = input.year - next.head.birthYear;
  if (
    age >= LEADER_RETIREMENT_AGE ||
    (age >= LEADER_LATE_CAREER_AGE && input.rng() < LEADER_RETIREMENT_CHANCE)
  ) {
    const successor = newLeader(
      next.governmentPartyIds[0] ?? next.head.partyId,
      input.year,
      input.namePool,
      input.rng,
      next.head.name
    );
    events.push({
      kind: "leaderReplaced",
      previous: next.head,
      next: successor,
      reason: "retired",
    });
    next = { ...next, head: successor };
  }

  const snap = snapElectionDue(next, input.turn, input.turnsPerYear);
  if (snap || input.turn >= next.nextElectionTurn) {
    const election = runNationalElection(next, {
      ...input,
      snap: snap && input.turn < next.nextElectionTurn,
    });
    next = election.state;
    events.push(...election.events);
  }
  return { state: next, events };
}
