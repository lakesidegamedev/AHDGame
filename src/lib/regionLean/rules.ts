/**
 * Region lean labels measured against the two main parties of a country.
 *
 * Region electorate leans are population averages, so they span a far narrower
 * range than party platforms. Labelling them on the candidate ruler reads
 * almost every region as centrist. Instead the lean is converted back to an
 * implied winning margin between the two main platforms and bucketed the way
 * election forecasters bucket states.
 */

/** Lean units per percentage point of winning margin, fitted to the census seed. */
export const LEAN_PER_MARGIN_POINT = 0.033;

/** Margins below this many points read as a toss-up. */
export const SWING_MARGIN_MAX = 5;
/** Margins below this many points read as "Leans". */
export const LEANS_MARGIN_MAX = 10;
/** Margins below this many points read as "Likely"; at or above, "Solid". */
export const LIKELY_MARGIN_MAX = 20;

export type LeanStrength = "swing" | "leans" | "likely" | "solid";

export interface PartyPlatform {
  id: string;
  name: string;
  abbreviation?: string;
  /** Platform position on the single display axis, same scale as a region lean. */
  lean: number;
  isDefault?: boolean;
  memberCount?: number;
}

export interface MainParties {
  /** The party with the lower lean value. */
  low: PartyPlatform;
  /** The party with the higher lean value. */
  high: PartyPlatform;
  evenSplit: number;
}

export interface RegionLeanVerdict {
  strength: LeanStrength;
  /** Implied winning margin in points, always non-negative. */
  margin: number;
  /** The favoured party, or null for a swing region. */
  favoured: PartyPlatform | null;
  label: string;
}

const STRENGTH_PREFIX: Record<Exclude<LeanStrength, "swing">, string> = {
  leans: "Leans",
  likely: "Likely",
  solid: "Solid",
};

/**
 * Short name for labels: drops a trailing "Party" and any "of <place>" tail,
 * so "Liberal Party of Canada" reads "Liberal".
 */
export function partyShortName(party: Pick<PartyPlatform, "name" | "abbreviation">): string {
  const trimmed = party.name
    .replace(/\s+Party(\s+of\s+.+)?$/i, "")
    .replace(/^The\s+/i, "")
    .trim();
  return trimmed || party.abbreviation?.trim() || party.name;
}

function furthestApartPair(parties: PartyPlatform[]): [PartyPlatform, PartyPlatform] | null {
  let best: [PartyPlatform, PartyPlatform] | null = null;
  let bestGap = 0;
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const gap = Math.abs(parties[i].lean - parties[j].lean);
      if (gap > bestGap) {
        bestGap = gap;
        best = [parties[i], parties[j]];
      }
    }
  }
  return best;
}

/**
 * The two parties a region is measured against: the two largest by members,
 * provided both have members and sit at different positions. Otherwise the two
 * furthest-apart default parties, then the two furthest-apart parties of any
 * kind. Null when no two parties differ, so callers fall back to the ruler.
 */
export function pickMainParties(parties: PartyPlatform[]): MainParties | null {
  const usable = parties.filter((p) => Number.isFinite(p.lean));
  if (usable.length < 2) return null;

  const bySize = [...usable].sort(
    (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0) || a.id.localeCompare(b.id)
  );
  let pair: [PartyPlatform, PartyPlatform] | null = null;
  if ((bySize[1].memberCount ?? 0) > 0 && bySize[0].lean !== bySize[1].lean) {
    pair = [bySize[0], bySize[1]];
  }
  pair ??= furthestApartPair(usable.filter((p) => p.isDefault));
  pair ??= furthestApartPair(usable);
  if (!pair) return null;

  const [low, high] = pair[0].lean <= pair[1].lean ? pair : [pair[1], pair[0]];
  return { low, high, evenSplit: (low.lean + high.lean) / 2 };
}

export function marginStrength(margin: number): LeanStrength {
  if (margin < SWING_MARGIN_MAX) return "swing";
  if (margin < LEANS_MARGIN_MAX) return "leans";
  if (margin < LIKELY_MARGIN_MAX) return "likely";
  return "solid";
}

/** Implied winning margin in points for a region lean against the even split. */
export function impliedMargin(lean: number, evenSplit: number): number {
  return Math.abs(lean - evenSplit) / LEAN_PER_MARGIN_POINT;
}

export function regionLeanVerdict(lean: number, main: MainParties): RegionLeanVerdict {
  const margin = impliedMargin(lean, main.evenSplit);
  const strength = marginStrength(margin);
  if (strength === "swing") return { strength, margin, favoured: null, label: "Swing" };
  const favoured = lean > main.evenSplit ? main.high : main.low;
  return {
    strength,
    margin,
    favoured,
    label: `${STRENGTH_PREFIX[strength]} ${partyShortName(favoured)}`,
  };
}
