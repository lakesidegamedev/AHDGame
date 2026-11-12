import type { ElectorateUnit } from "./electorateUnit";

export interface ElectorateLean {
  economicLean: number;
  socialLean: number;
}

const round2 = (v: number) => Math.max(-5, Math.min(5, Math.round(v * 100) / 100));

/**
 * Turnout-weighted mean lean of a region's electorate units, on the -5..+5
 * axis, to two decimals. Zeros when nobody votes.
 */
export function electorateMeanLean(
  units: readonly Pick<
    ElectorateUnit,
    "populationPct" | "economicLean" | "socialLean" | "turnout"
  >[]
): ElectorateLean {
  let weight = 0;
  let econ = 0;
  let soc = 0;
  for (const u of units) {
    const w = (u.populationPct / 100) * (u.turnout / 100);
    if (!(w > 0)) continue;
    weight += w;
    econ += w * u.economicLean;
    soc += w * u.socialLean;
  }
  return weight > 0
    ? { economicLean: round2(econ / weight), socialLean: round2(soc / weight) }
    : { economicLean: 0, socialLean: 0 };
}
