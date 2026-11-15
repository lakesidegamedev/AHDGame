/**
 * Multipolar tension for the 2027 world (#5695 item 3): one tension value per
 * pair of blocs instead of one global number.
 *
 * Three blocs: US-led (the Washington pole), CN-led (the Beijing and Moscow
 * poles together) and non-aligned. Each pair holds its own value that relaxes
 * toward a floor set by what stands between those two blocs: a structural
 * baseline, wars fought across the pair and trade embargoes across the pair.
 * The global tension value and its events are unchanged; the dyads sit beside
 * it, and the dials read the hottest of the two.
 *
 * Pure: plain data in, plain data out.
 */
import { ALIGNMENT_POLES } from "@/lib/constants/alignmentEras";
import type { WarPressureInput } from "../tension";

/** The two great powers lead their own blocs whatever their alignment row says. */
export const US_BLOC_LEADER: string = String(ALIGNMENT_POLES.WASHINGTON.leaderCountryId);
export const CN_BLOC_LEADER: string = String(ALIGNMENT_POLES.BEIJING.leaderCountryId);

export type WorldBlocId = "us" | "cn" | "nonAligned";
export type BlocPairId = "us-cn" | "us-nonAligned" | "cn-nonAligned";

export const BLOC_PAIRS: readonly BlocPairId[] = ["us-cn", "us-nonAligned", "cn-nonAligned"];

/** First game year the dyads run. Earlier worlds keep the bipolar global value only. */
export const BLOC_TENSION_FIRST_YEAR = 2027;

/**
 * Structural rivalry with no war and no sanctions. The US-China pair carries a
 * standing great-power rivalry; the pairs with the non-aligned middle do not.
 */
export const BLOC_PAIR_BASELINE: Record<BlocPairId, number> = {
  "us-cn": 30,
  "us-nonAligned": 10,
  "cn-nonAligned": 8,
};

/** Floor points per point of war intensity fought across a pair. */
const WAR_WEIGHT = 0.25;
/** Most a pair's floor can take from wars. */
const WAR_CAP = 40;
/** Extra floor when nuclear-armed countries stand on both sides of that war. */
const NUCLEAR_WAR_BONUS = 15;
/** Floor points per active embargo between members of the two blocs. */
const EMBARGO_WEIGHT = 1.5;
const EMBARGO_CAP = 15;
/** Fraction of the gap to the floor closed per turn; the global value uses the same. */
const DYAD_RELAXATION = 0.08;

export interface BlocDyad {
  pair: BlocPairId;
  value: number;
  floor: number;
}

export interface AlignmentShareInput {
  shares: Partial<Record<string, number>>;
  nonAligned: number;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/**
 * The bloc a country sits in, from its alignment shares. Washington is US-led;
 * Beijing and Moscow together are CN-led; a country whose uncommitted share
 * beats both is non-aligned. The two great powers always lead their own bloc.
 */
export function blocOfAlignment(
  countryId: string,
  row: AlignmentShareInput | undefined
): WorldBlocId {
  if (countryId === US_BLOC_LEADER) return "us";
  if (countryId === CN_BLOC_LEADER) return "cn";
  if (!row) return "nonAligned";
  const west = row.shares.WASHINGTON ?? 0;
  const east = (row.shares.BEIJING ?? 0) + (row.shares.MOSCOW ?? 0);
  if (west >= east && west > row.nonAligned) return "us";
  if (east > west && east > row.nonAligned) return "cn";
  return "nonAligned";
}

export function blocPairOf(a: WorldBlocId, b: WorldBlocId): BlocPairId | null {
  if (a === b) return null;
  const set = new Set([a, b]);
  if (set.has("us") && set.has("cn")) return "us-cn";
  if (set.has("us")) return "us-nonAligned";
  return "cn-nonAligned";
}

export interface BlocFloorInput {
  blocOf: (countryId: string) => WorldBlocId;
  wars: readonly Pick<WarPressureInput, "sideACountries" | "sideBCountries" | "intensity">[];
  embargoes: readonly { sourceCountry: string; targetCountry: string }[];
  nuclearCountries: ReadonlySet<string>;
}

/** The standing floor of every pair this turn. */
export function blocDyadFloors(input: BlocFloorInput): Record<BlocPairId, number> {
  const wars: Record<BlocPairId, number> = { "us-cn": 0, "us-nonAligned": 0, "cn-nonAligned": 0 };
  const embargoes: Record<BlocPairId, number> = {
    "us-cn": 0,
    "us-nonAligned": 0,
    "cn-nonAligned": 0,
  };
  for (const war of input.wars) {
    const intensity = Math.max(0, Math.min(100, war.intensity));
    const blocsA = new Set(war.sideACountries.map(input.blocOf));
    const blocsB = new Set(war.sideBCountries.map(input.blocOf));
    const nuclear =
      war.sideACountries.some((c) => input.nuclearCountries.has(c)) &&
      war.sideBCountries.some((c) => input.nuclearCountries.has(c));
    const pairs = new Set<BlocPairId>();
    for (const a of blocsA) {
      for (const b of blocsB) {
        const pair = blocPairOf(a, b);
        if (pair) pairs.add(pair);
      }
    }
    for (const pair of pairs) {
      wars[pair] += intensity * WAR_WEIGHT + (nuclear ? NUCLEAR_WAR_BONUS : 0);
    }
  }
  for (const embargo of input.embargoes) {
    const pair = blocPairOf(
      input.blocOf(embargo.sourceCountry),
      input.blocOf(embargo.targetCountry)
    );
    if (pair) embargoes[pair] += EMBARGO_WEIGHT;
  }
  const out = {} as Record<BlocPairId, number>;
  for (const pair of BLOC_PAIRS) {
    out[pair] = clamp(
      BLOC_PAIR_BASELINE[pair] +
        Math.min(WAR_CAP, wars[pair]) +
        Math.min(EMBARGO_CAP, embargoes[pair])
    );
  }
  return out;
}

/**
 * One turn for every pair: a value below its floor rises to it at once, a
 * value above it relaxes toward it. Missing pairs start at their floor.
 */
export function stepBlocDyads(
  previous: readonly BlocDyad[] | undefined,
  floors: Record<BlocPairId, number>
): BlocDyad[] {
  return BLOC_PAIRS.map((pair) => {
    const floor = floors[pair];
    const prior = previous?.find((d) => d.pair === pair)?.value;
    const value =
      prior == null || !Number.isFinite(prior) || prior <= floor
        ? floor
        : clamp(Math.max(floor, prior + (floor - prior) * DYAD_RELAXATION));
    return { pair, value, floor };
  });
}

/** The hottest pair, which is what readiness and procurement answer to. */
export function hottestDyad(dyads: readonly BlocDyad[] | undefined): BlocDyad | null {
  if (!dyads || dyads.length === 0) return null;
  return dyads.reduce((best, d) => (d.value > best.value ? d : best));
}
