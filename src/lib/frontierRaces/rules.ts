/** Rules for the 2040s frontier programme races: pure data in, data out, no I/O. */

export type FrontierRaceId = "fusion" | "orbital" | "biotech";
export type FrontierEntrantKind = "country" | "corporation";

export interface FrontierRaceDef {
  id: FrontierRaceId;
  label: string;
  /** What the winning method is called. */
  method: string;
  /** First in-game year funding is allowed. */
  opensYear: number;
  /** Points an entrant needs on its own to win. */
  threshold: number;
}

export const FRONTIER_RACES: readonly FrontierRaceDef[] = [
  {
    id: "fusion",
    label: "Fusion power programme",
    method: "Commercial fusion method",
    opensYear: 2041,
    threshold: 6000,
  },
  {
    id: "orbital",
    label: "Orbital industry programme",
    method: "Orbital manufacturing method",
    opensYear: 2043,
    threshold: 7000,
  },
  {
    id: "biotech",
    label: "Biotech platform programme",
    method: "Programmable biotech method",
    opensYear: 2046,
    threshold: 8000,
  },
];

export const FRONTIER_RACE_IDS: readonly FrontierRaceId[] = FRONTIER_RACES.map((r) => r.id);

export function frontierRaceDef(id: string): FrontierRaceDef | undefined {
  return FRONTIER_RACES.find((r) => r.id === id);
}

/** Treasury cash (anchor currency) one point costs a nation. */
export const COUNTRY_CASH_PER_POINT = 25_000_000;
/** Research points one point costs a corporation. */
export const CORPORATION_RD_PER_POINT = 1;
/** Largest single funding order, so one order cannot skip a race. */
export const MAX_POINTS_PER_ORDER = 1000;
/** Share of the threshold a loser must have funded to feel the loss. */
export const MEANINGFUL_STAKE_SHARE = 0.25;
/** Turns between a race being won and the licence reaching the losers. */
export const SUNSET_TURNS = 48;
/** Strength of the licence relative to the winning method. */
export const LICENCE_STRENGTH = 0.5;
/**
 * Plant output a corporation gets from holding a method, at full strength.
 * Sized so one method (6000+ research points) beats what the same points buy
 * from ordinary frontier programmes (about +5.6%), because a race can be lost.
 */
export const METHOD_PLANT_OUTPUT_PCT = 0.1;
/** National approval points for the winning nation. */
export const WINNER_APPROVAL = 1.5;
/** National approval points lost by a nation that funded a meaningful stake and lost. */
export const LOSER_APPROVAL = -0.4;
/** National approval points a licensed nation regains when the licence arrives. Smaller than the loss. */
export const LICENCE_APPROVAL = 0.2;
/** Share of a losing corporation's spent research points returned when its licence arrives. */
export const CONVERSION_RETURN_SHARE = 0.4;

export type FrontierRaceStatus = "pending" | "open" | "won";

export function raceStatus(
  def: FrontierRaceDef,
  currentYear: number,
  winner: unknown
): FrontierRaceStatus {
  if (winner) return "won";
  return currentYear >= def.opensYear ? "open" : "pending";
}

export function entrantKey(kind: FrontierEntrantKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseEntrantKey(key: string): { kind: FrontierEntrantKind; id: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const kind = key.slice(0, idx);
  const id = key.slice(idx + 1);
  if ((kind !== "country" && kind !== "corporation") || id.length === 0) return null;
  return { kind, id };
}

/** Points a funding order buys, clamped to the per-order cap and whole numbers. */
export function clampOrderPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.min(MAX_POINTS_PER_ORDER, Math.floor(points)));
}

export function countryOrderCost(points: number): number {
  return clampOrderPoints(points) * COUNTRY_CASH_PER_POINT;
}

export function corporationOrderCost(points: number): number {
  return clampOrderPoints(points) * CORPORATION_RD_PER_POINT;
}

export interface RaceEntrant {
  key: string;
  points: number;
}

export interface RankedEntrant extends RaceEntrant {
  kind: FrontierEntrantKind;
  id: string;
  /** 0 to 1, share of the threshold reached. */
  progress: number;
  rank: number;
}

export function rankEntrants(
  contributions: Readonly<Record<string, number>> | undefined,
  threshold: number
): RankedEntrant[] {
  const rows: RankedEntrant[] = [];
  for (const [key, raw] of Object.entries(contributions ?? {})) {
    const parsed = parseEntrantKey(key);
    const points = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    if (!parsed || points <= 0) continue;
    rows.push({
      key,
      points,
      kind: parsed.kind,
      id: parsed.id,
      progress: Math.min(1, points / threshold),
      rank: 0,
    });
  }
  rows.sort((a, b) => b.points - a.points || (a.key < b.key ? -1 : 1));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

/**
 * The winner of an open race: the leading entrant, once it has reached the
 * threshold. Ties on points break on the entrant key so every host agrees.
 */
export function pickWinner(
  contributions: Readonly<Record<string, number>> | undefined,
  threshold: number
): RankedEntrant | null {
  const ranked = rankEntrants(contributions, threshold);
  const lead = ranked[0];
  return lead && lead.points >= threshold ? lead : null;
}

export interface RaceOutcome {
  winner: RankedEntrant;
  /** Losing entrants that funded a meaningful stake. */
  losers: RankedEntrant[];
  /** Turn the licence reaches the losers. */
  licenceTurn: number;
}

export function resolveRace(
  contributions: Readonly<Record<string, number>> | undefined,
  threshold: number,
  currentTurn: number
): RaceOutcome | null {
  const winner = pickWinner(contributions, threshold);
  if (!winner) return null;
  const losers = rankEntrants(contributions, threshold).filter(
    (row) => row.key !== winner.key && row.progress >= MEANINGFUL_STAKE_SHARE
  );
  return { winner, losers, licenceTurn: currentTurn + SUNSET_TURNS };
}

/** Plant output a corporation gains from methods it holds, by holding kind. */
export function methodPlantOutputPct(holdings: readonly ("winner" | "licence")[]): number {
  let pct = 0;
  for (const held of holdings) {
    pct += METHOD_PLANT_OUTPUT_PCT * (held === "winner" ? 1 : LICENCE_STRENGTH);
  }
  return pct;
}

/** Research points returned to a losing corporation when its licence arrives. */
export function conversionReturn(points: number): number {
  return Math.floor(Math.max(0, points) * CORPORATION_RD_PER_POINT * CONVERSION_RETURN_SHARE);
}

/** Tech effects a corporation's held methods add to its primary sector. */
export function frontierMethodEffects(
  methods: Readonly<Record<string, "winner" | "licence">> | undefined
): { kind: "plantOutput"; pct: number }[] {
  const pct = methodPlantOutputPct(Object.values(methods ?? {}));
  return pct > 0 ? [{ kind: "plantOutput", pct }] : [];
}
