/**
 * Party renewal rules: splinter, insurgent founding and fold for NPP-run
 * countries, plus the seat-share ratchet cap and the frontier re-entry window.
 *
 * Plain data in, plain data out. The turn shell builds one snapshot per
 * national general election (lower chamber), keeps the last two, and asks
 * {@link planPartyRenewal} what should happen this cycle. Randomness arrives as
 * an injected rng so the same world, country and cycle always decide the same.
 *
 * Positions use the party grid (-5..+5 on the economic and social axes).
 */

/** Approval a governing party must stay under for two terms to risk a splinter. */
export const SPLINTER_APPROVAL_CEILING = 40;
/** National chamber seat share a party must hold for two terms to risk a splinter. */
export const SPLINTER_SEAT_SHARE = 0.55;
/** Chance a qualifying party splinters this cycle, one condition met. */
export const SPLINTER_CHANCE = 0.5;
/** Chance when both the approval and the seat condition hold. */
export const SPLINTER_CHANCE_BOTH = 0.65;
/** Share of the parent's eligible NPPs the faction takes. */
export const SPLINTER_NPP_SHARE = 0.25;
/** A parent needs at least this many movable NPPs to lose a faction. */
export const SPLINTER_MIN_PARENT_NPPS = 4;
/** How far the splinter sits from its parent on one axis. */
export const SPLINTER_OFFSET = 1.5;

/** National vote share under which a party folds after two general elections. */
export const FOLD_VOTE_SHARE = 0.02;
/** Folding never leaves a country with fewer active parties than this. */
export const FOLD_MIN_REMAINING_PARTIES = 2;

/** Distance from the electorate centre to each outer ideological anchor. */
export const FOUNDING_ANCHOR_SPREAD = 2;
/** A party within this distance of an anchor covers it. */
export const FOUNDING_REACH = 2.5;
/** Two gap anchors from consecutive elections within this distance are the same gap. */
export const FOUNDING_GAP_MATCH = 1;
/** Chance a persistent gap founds a party this cycle. */
export const FOUNDING_CHANCE = 0.5;
/** NPPs a founded party starts with. */
export const FOUNDING_BENCH_SIZE = 4;

/** A party above this prior seat share gets no further incumbency shield. */
export const RATCHET_SEAT_SHARE_CAP = 0.5;
/** A party may re-enter a region it held in either of the last two cycles. */
export const FRONTIER_REENTRY_CYCLES = 2;

const AXIS_LIMIT = 5;
const ANCHOR_LIMIT = 4.5;

export interface IdeologyPoint {
  economic: number;
  social: number;
}

export interface RenewalParty extends IdeologyPoint {
  partyId: string;
  name: string;
  abbreviation: string;
  color: string;
  /** False for player-created parties: they never split or fold by this mechanic. */
  renewable: boolean;
}

export interface RenewalPartyResult {
  partyId: string;
  voteShare: number;
  seatShare: number;
}

/** What one national general election left behind. */
export interface RenewalCycleSnapshot {
  cycle: number;
  governingPartyId: string | null;
  approval: number | null;
  /** Every active party at the time, including those that won nothing. */
  parties: RenewalPartyResult[];
  /** Ideological anchors with no party within reach after this election. */
  gaps: IdeologyPoint[];
}

export interface RenewalNpp extends IdeologyPoint {
  nppId: string;
  homeState: string;
  /** Party leaders and heads of government stay with their party. */
  protected: boolean;
}

export interface SplinterPlan {
  parentPartyId: string;
  position: IdeologyPoint;
  nppIds: string[];
  /** Region holding most of the faction: its organisational base. */
  baseRegions: string[];
  name: string;
  abbreviation: string;
  color: string;
}

export interface FoundingPlan {
  position: IdeologyPoint;
  name: string;
  abbreviation: string;
  color: string;
}

export interface FoldPlan {
  partyId: string;
  targetPartyId: string;
}

export interface RenewalPlan {
  folds: FoldPlan[];
  splinter: SplinterPlan | null;
  founding: FoundingPlan | null;
}

export interface RenewalInput {
  previous: RenewalCycleSnapshot;
  latest: RenewalCycleSnapshot;
  /** Active parties now, after the latest election. */
  parties: RenewalParty[];
  /** Active NPPs of every renewable party, keyed by party id. */
  nppsByParty: ReadonlyMap<string, readonly RenewalNpp[]>;
}

// ─── Shares ───────────────────────────────────────────────────────────────────

/** National vote share per party from raw per-candidate tallies. */
export function nationalVoteShares(
  tallies: readonly {
    totalVotes: Record<string, number>;
    candidateParties: Record<string, string>;
  }[]
): Map<string, number> {
  const votes = new Map<string, number>();
  let total = 0;
  for (const tally of tallies) {
    for (const [candidateId, raw] of Object.entries(tally.totalVotes ?? {})) {
      const party = tally.candidateParties?.[candidateId];
      if (!party || !Number.isFinite(raw) || raw <= 0) continue;
      votes.set(party, (votes.get(party) ?? 0) + raw);
      total += raw;
    }
  }
  const shares = new Map<string, number>();
  if (total <= 0) return shares;
  for (const [party, count] of votes) shares.set(party, count / total);
  return shares;
}

/** Seat share per party from seated officials of one chamber. */
export function chamberSeatShares(
  officials: readonly { party: string | null | undefined; seats?: number | null }[]
): Map<string, number> {
  const seats = new Map<string, number>();
  let total = 0;
  for (const official of officials) {
    const count = Number.isFinite(official.seats) ? Math.max(0, official.seats as number) : 1;
    total += count;
    if (!official.party) continue;
    seats.set(official.party, (seats.get(official.party) ?? 0) + count);
  }
  const shares = new Map<string, number>();
  if (total <= 0) return shares;
  for (const [party, count] of seats) shares.set(party, count / total);
  return shares;
}

/**
 * The ratchet cap: a prior seat share above {@link RATCHET_SEAT_SHARE_CAP}
 * earns no more shield than exactly half the seats.
 */
export function capIncumbentSeatShares(shares: ReadonlyMap<string, number>): Map<string, number> {
  return new Map(
    [...shares].map(([party, share]) => [party, Math.min(share, RATCHET_SEAT_SHARE_CAP)])
  );
}

// ─── Ideological space ────────────────────────────────────────────────────────

export function ideologyDistance(a: IdeologyPoint, b: IdeologyPoint): number {
  return Math.hypot(a.economic - b.economic, a.social - b.social);
}

const clampAxis = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

/** Vote-weighted centre of the parties: where the electorate actually sits. */
export function electorateCentre(
  parties: readonly (IdeologyPoint & { partyId: string })[],
  voteShares: ReadonlyMap<string, number>
): IdeologyPoint {
  let weight = 0;
  let economic = 0;
  let social = 0;
  for (const party of parties) {
    const share = voteShares.get(party.partyId) ?? 0;
    if (share <= 0) continue;
    weight += share;
    economic += share * party.economic;
    social += share * party.social;
  }
  if (weight <= 0) return { economic: 0, social: 0 };
  return { economic: economic / weight, social: social / weight };
}

/** The centre plus one anchor each way along both axes. */
export function ideologyAnchors(centre: IdeologyPoint): IdeologyPoint[] {
  const d = FOUNDING_ANCHOR_SPREAD;
  return [
    [0, 0],
    [d, 0],
    [-d, 0],
    [0, d],
    [0, -d],
  ].map(([e, s]) => ({
    economic: clampAxis(centre.economic + e, ANCHOR_LIMIT),
    social: clampAxis(centre.social + s, ANCHOR_LIMIT),
  }));
}

function nearestDistance(point: IdeologyPoint, parties: readonly IdeologyPoint[]): number {
  let best = Infinity;
  for (const party of parties) best = Math.min(best, ideologyDistance(point, party));
  return best;
}

/** Anchors no party reaches. */
export function ideologyGaps(
  anchors: readonly IdeologyPoint[],
  parties: readonly IdeologyPoint[]
): IdeologyPoint[] {
  return anchors.filter((anchor) => nearestDistance(anchor, parties) > FOUNDING_REACH);
}

// ─── Names, abbreviations, colours ────────────────────────────────────────────

const GENERIC_SUFFIXES = [
  "Party",
  "Union",
  "Alliance",
  "League",
  "Movement",
  "Front",
  "Congress",
  "Partei",
];

function splitSuffix(name: string): { core: string; suffix: string | null } {
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  if (words.length > 1 && GENERIC_SUFFIXES.includes(last)) {
    return { core: words.slice(0, -1).join(" "), suffix: last };
  }
  return { core: name.trim(), suffix: null };
}

/** The generic noun most of this country's parties end with, else "Party". */
export function dominantPartySuffix(existingNames: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of existingNames) {
    const { suffix } = splitSuffix(name);
    if (suffix) counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }
  let best = "Party";
  let bestCount = 0;
  for (const suffix of GENERIC_SUFFIXES) {
    const count = counts.get(suffix) ?? 0;
    if (count > bestCount) {
      best = suffix;
      bestCount = count;
    }
  }
  return best;
}

function firstFreeName(candidates: readonly string[], existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (const candidate of candidates) {
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  const base = candidates[0] ?? "New Party";
  for (let n = 2; ; n++) {
    const numbered = `${base} ${n}`;
    if (!taken.has(numbered.toLowerCase())) return numbered;
  }
}

/** A faction's name, built from its parent's own naming pattern. */
export function splinterPartyName(parentName: string, existingNames: readonly string[]): string {
  const { core, suffix } = splitSuffix(parentName);
  const noun = suffix ?? dominantPartySuffix(existingNames);
  return firstFreeName(
    [
      `${core} Reform ${noun}`,
      `New ${core} ${noun}`,
      `Independent ${core} ${noun}`,
      `${core} Renewal ${noun}`,
    ],
    existingNames
  );
}

type Lean = "low" | "mid" | "high";
const lean = (value: number): Lean => (value < -1.5 ? "low" : value > 1.5 ? "high" : "mid");

/** Economic lean, then social lean (high social = conservative). */
const FOUNDING_ADJECTIVES: Record<Lean, Record<Lean, string[]>> = {
  low: {
    low: ["Green Left", "Progressive"],
    mid: ["Social Democratic", "Labour"],
    high: ["Workers'", "People's"],
  },
  mid: {
    low: ["Liberal", "Civic"],
    mid: ["Centre", "Unity"],
    high: ["Christian Democratic", "Heritage"],
  },
  high: {
    low: ["Free Democratic", "Liberty"],
    mid: ["Reform", "Enterprise"],
    high: ["National Conservative", "Tradition"],
  },
};

/** A founded party's name from where it sits, in the country's naming pattern. */
export function foundingPartyName(
  position: IdeologyPoint,
  existingNames: readonly string[]
): string {
  const noun = dominantPartySuffix(existingNames);
  const adjectives = FOUNDING_ADJECTIVES[lean(position.economic)][lean(position.social)];
  return firstFreeName(
    [...adjectives.map((a) => `${a} ${noun}`), ...adjectives.map((a) => `New ${a} ${noun}`)],
    existingNames
  );
}

/** Initials of the capitalised words, made unique against the country's parties. */
export function renewalAbbreviation(name: string, existing: readonly string[]): string {
  const initials = (name.match(/\b[A-Z][\p{L}']*/gu) ?? [])
    .map((w) => w[0])
    .join("")
    .slice(0, 5);
  const base = initials.length >= 2 ? initials : "NEW";
  const taken = new Set(existing.map((a) => a.toUpperCase()));
  if (!taken.has(base.toUpperCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate.toUpperCase())) return candidate;
  }
}

const RENEWAL_COLORS = [
  "#0ea5e9",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#eab308",
  "#ec4899",
  "#84cc16",
  "#6366f1",
  "#f43f5e",
  "#22c55e",
  "#78716c",
  "#06b6d4",
];

/** First palette colour no party in the country already uses. */
export function renewalColor(existing: readonly string[], salt = 0): string {
  const taken = new Set(existing.map((c) => c.toLowerCase()));
  for (let i = 0; i < RENEWAL_COLORS.length; i++) {
    const color = RENEWAL_COLORS[(i + salt) % RENEWAL_COLORS.length];
    if (!taken.has(color)) return color;
  }
  return RENEWAL_COLORS[salt % RENEWAL_COLORS.length];
}

// ─── Splinter ─────────────────────────────────────────────────────────────────

function resultFor(snapshot: RenewalCycleSnapshot, partyId: string): RenewalPartyResult | null {
  return snapshot.parties.find((p) => p.partyId === partyId) ?? null;
}

/** Which splinter conditions a party meets over the last two elections. */
export function splinterConditions(
  previous: RenewalCycleSnapshot,
  latest: RenewalCycleSnapshot,
  partyId: string
): { unpopularGovernment: boolean; dominantChamber: boolean } {
  const before = resultFor(previous, partyId);
  const after = resultFor(latest, partyId);
  const unpopular = (s: RenewalCycleSnapshot) =>
    s.governingPartyId === partyId &&
    s.approval != null &&
    Number.isFinite(s.approval) &&
    s.approval < SPLINTER_APPROVAL_CEILING;
  return {
    unpopularGovernment: unpopular(previous) && unpopular(latest),
    dominantChamber:
      !!before &&
      !!after &&
      before.seatShare > SPLINTER_SEAT_SHARE &&
      after.seatShare > SPLINTER_SEAT_SHARE,
  };
}

/** The open side next to the parent: the offset furthest from every other party. */
export function splinterPosition(
  parent: IdeologyPoint & { partyId: string },
  parties: readonly (IdeologyPoint & { partyId: string })[]
): IdeologyPoint {
  const others = parties.filter((p) => p.partyId !== parent.partyId);
  const d = SPLINTER_OFFSET;
  let best: IdeologyPoint | null = null;
  let bestRoom = -Infinity;
  for (const [e, s] of [
    [d, 0],
    [-d, 0],
    [0, d],
    [0, -d],
  ]) {
    const point = {
      economic: roundHalf(clampAxis(parent.economic + e, AXIS_LIMIT)),
      social: roundHalf(clampAxis(parent.social + s, AXIS_LIMIT)),
    };
    if (point.economic === parent.economic && point.social === parent.social) continue;
    const room = others.length > 0 ? nearestDistance(point, others) : 0;
    if (room > bestRoom) {
      best = point;
      bestRoom = room;
    }
  }
  return best ?? { economic: parent.economic, social: parent.social };
}

/** The parent's NPPs closest to the splinter's position, leaders excluded. */
export function pickSplinterNpps(
  npps: readonly RenewalNpp[],
  position: IdeologyPoint
): RenewalNpp[] {
  const movable = npps.filter((n) => !n.protected);
  if (movable.length < SPLINTER_MIN_PARENT_NPPS) return [];
  const take = Math.max(1, Math.ceil(movable.length * SPLINTER_NPP_SHARE));
  return [...movable]
    .sort(
      (a, b) =>
        ideologyDistance(a, position) - ideologyDistance(b, position) ||
        a.nppId.localeCompare(b.nppId)
    )
    .slice(0, take);
}

/** Most common home regions of the faction, most first. */
export function factionBaseRegions(npps: readonly RenewalNpp[]): string[] {
  const counts = new Map<string, number>();
  for (const npp of npps) {
    if (npp.homeState) counts.set(npp.homeState, (counts.get(npp.homeState) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([region]) => region);
}

// ─── Fold ─────────────────────────────────────────────────────────────────────

/**
 * Parties under {@link FOLD_VOTE_SHARE} in both of the last two general
 * elections fold into their nearest surviving renewable neighbour. A party
 * missing from either snapshot did not exist for both and is spared.
 */
export function planFolds(
  previous: RenewalCycleSnapshot,
  latest: RenewalCycleSnapshot,
  parties: readonly RenewalParty[]
): FoldPlan[] {
  const weak = parties
    .filter((p) => p.renewable)
    .map((p) => ({
      party: p,
      before: resultFor(previous, p.partyId),
      after: resultFor(latest, p.partyId),
    }))
    .filter(
      ({ before, after }) =>
        !!before &&
        !!after &&
        before.voteShare < FOLD_VOTE_SHARE &&
        after.voteShare < FOLD_VOTE_SHARE
    )
    .sort(
      (a, b) =>
        a.after!.voteShare - b.after!.voteShare || a.party.partyId.localeCompare(b.party.partyId)
    )
    .map(({ party }) => party);
  // A weak party is never a fold target, so no NPP moves twice in one cycle.
  const weakIds = new Set(weak.map((p) => p.partyId));
  const folds: FoldPlan[] = [];
  for (const party of weak) {
    if (parties.length - folds.length - 1 < FOLD_MIN_REMAINING_PARTIES) break;
    const target = parties
      .filter((p) => p.renewable && !weakIds.has(p.partyId))
      .sort(
        (a, b) =>
          ideologyDistance(a, party) - ideologyDistance(b, party) ||
          a.partyId.localeCompare(b.partyId)
      )[0];
    if (!target) continue;
    folds.push({ partyId: party.partyId, targetPartyId: target.partyId });
  }
  return folds;
}

// ─── Founding ─────────────────────────────────────────────────────────────────

/** A gap present after both elections and still open now, roomiest first. */
export function persistentGap(
  previous: RenewalCycleSnapshot,
  latest: RenewalCycleSnapshot,
  parties: readonly IdeologyPoint[]
): IdeologyPoint | null {
  const candidates = latest.gaps
    .filter((gap) => previous.gaps.some((g) => ideologyDistance(g, gap) <= FOUNDING_GAP_MATCH))
    .filter((gap) => nearestDistance(gap, parties) > FOUNDING_REACH)
    .map((gap) => ({ gap, room: nearestDistance(gap, parties) }))
    .sort(
      (a, b) => b.room - a.room || a.gap.economic - b.gap.economic || a.gap.social - b.gap.social
    );
  const gap = candidates[0]?.gap;
  return gap ? { economic: roundHalf(gap.economic), social: roundHalf(gap.social) } : null;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

/**
 * Everything renewal does in one country for one election cycle: any number
 * of folds, at most one splinter and at most one founding. Draws from `rng`
 * in a fixed order (splinter roll, then founding roll) so a replay with the
 * same seed decides the same.
 */
export function planPartyRenewal(input: RenewalInput, rng: () => number): RenewalPlan {
  const { previous, latest } = input;
  const folds = planFolds(previous, latest, input.parties);
  const folded = new Set(folds.map((f) => f.partyId));
  const remaining = input.parties.filter((p) => !folded.has(p.partyId));
  const names = input.parties.map((p) => p.name);
  const abbreviations = input.parties.map((p) => p.abbreviation);
  const colors = input.parties.map((p) => p.color);

  // Splinter: the largest qualifying party by latest seat share.
  const qualifying = remaining
    .filter((p) => p.renewable)
    .map((p) => ({ party: p, conditions: splinterConditions(previous, latest, p.partyId) }))
    .filter(({ conditions }) => conditions.unpopularGovernment || conditions.dominantChamber)
    .sort(
      (a, b) =>
        (resultFor(latest, b.party.partyId)?.seatShare ?? 0) -
          (resultFor(latest, a.party.partyId)?.seatShare ?? 0) ||
        a.party.partyId.localeCompare(b.party.partyId)
    );
  let splinter: SplinterPlan | null = null;
  const splinterRoll = rng();
  const top = qualifying[0];
  if (top) {
    const both = top.conditions.unpopularGovernment && top.conditions.dominantChamber;
    if (splinterRoll < (both ? SPLINTER_CHANCE_BOTH : SPLINTER_CHANCE)) {
      const position = splinterPosition(top.party, remaining);
      const npps = pickSplinterNpps(input.nppsByParty.get(top.party.partyId) ?? [], position);
      if (npps.length > 0) {
        const name = splinterPartyName(top.party.name, names);
        splinter = {
          parentPartyId: top.party.partyId,
          position,
          nppIds: npps.map((n) => n.nppId),
          baseRegions: factionBaseRegions(npps),
          name,
          abbreviation: renewalAbbreviation(name, abbreviations),
          color: renewalColor(colors),
        };
      }
    }
  }

  // Founding: a gap that survived both elections and the splinter.
  const occupied: IdeologyPoint[] = [...remaining, ...(splinter ? [splinter.position] : [])];
  let founding: FoundingPlan | null = null;
  const foundingRoll = rng();
  const gap = persistentGap(previous, latest, occupied);
  if (gap && foundingRoll < FOUNDING_CHANCE) {
    const takenNames = splinter ? [...names, splinter.name] : names;
    const name = foundingPartyName(gap, takenNames);
    founding = {
      position: gap,
      name,
      abbreviation: renewalAbbreviation(
        name,
        splinter ? [...abbreviations, splinter.abbreviation] : abbreviations
      ),
      color: renewalColor(splinter ? [...colors, splinter.color] : colors, 1),
    };
  }

  return { folds, splinter, founding };
}

// ─── Frontier re-entry ────────────────────────────────────────────────────────

/** Region to the last renewal cycle index the party held it, per party. */
export type HeldRegions = Record<string, Record<string, number>>;

/** Record this cycle's presence, dropping entries older than the re-entry window. */
export function recordHeldRegions(
  held: HeldRegions,
  presence: ReadonlyMap<string, ReadonlySet<string>>,
  cycleIndex: number
): HeldRegions {
  const out: HeldRegions = {};
  const keep = (index: number) => index > cycleIndex - FRONTIER_REENTRY_CYCLES;
  for (const [partyId, regions] of Object.entries(held)) {
    for (const [region, index] of Object.entries(regions)) {
      if (!keep(index)) continue;
      (out[partyId] ??= {})[region] = index;
    }
  }
  for (const [partyId, regions] of presence) {
    for (const region of regions) (out[partyId] ??= {})[region] = cycleIndex;
  }
  return out;
}

/** Regions a party may re-enter: held in either of the last two cycles. */
export function reentryRegions(
  held: Record<string, number> | undefined,
  latestCycleIndex: number
): string[] {
  if (!held) return [];
  return Object.entries(held)
    .filter(([, index]) => index > latestCycleIndex - FRONTIER_REENTRY_CYCLES)
    .map(([region]) => region)
    .sort();
}

/** One renewal event, named for the news feed. */
export interface RenewalNewsEvent {
  kind: "splinter" | "founding" | "fold";
  countryName: string;
  /** The new party (splinter, founding) or the party that folded. */
  partyName: string;
  /** The parent of a splinter, or the party a folded one joined. */
  relatedPartyName?: string;
}

/** Headline and body for a renewal event's system news post. */
export function renewalNewsPost(event: RenewalNewsEvent): { title: string; content: string } {
  const { countryName, partyName, relatedPartyName } = event;
  switch (event.kind) {
    case "splinter":
      return {
        title: `${partyName} splits from ${relatedPartyName ?? "its parent party"}`,
        content:
          `A faction of ${relatedPartyName ?? "an established party"} in ${countryName} has ` +
          `broken away to form ${partyName}. Its members take their seats and candidacies ` +
          `with them.`,
      };
    case "founding":
      return {
        title: `${partyName} founded in ${countryName}`,
        content:
          `${partyName} has been founded in ${countryName} to speak for voters no ` +
          `existing party represents. It starts with a small bench in one region.`,
      };
    case "fold":
      return {
        title: `${partyName} folds into ${relatedPartyName ?? "a larger party"}`,
        content:
          `After two weak elections, ${partyName} in ${countryName} has dissolved and its ` +
          `members have joined ${relatedPartyName ?? "a larger party"}.`,
      };
  }
}
