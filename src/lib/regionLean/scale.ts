import { getDisplayLean } from "@/lib/utils/demographics";
import { mainPartiesFor, regionLeanLabel, type PartyLabelSource } from "./partyLabel";
import type { MainParties } from "./rules";

/**
 * A country's lean scale: its two main parties and the even split between
 * them on each axis. Fills and labels read a region's lean from this point.
 */
export interface CountryLeanScale {
  main: MainParties | null;
  center: { economicLean: number; socialLean: number; displayLean: number };
}

/** What a region surface shows: the party-lean label and the centred tones. */
export interface RegionLeanDisplay {
  label: string;
  /** Lean from the even split, for colour only. */
  economicTone: number;
  socialTone: number;
  displayTone: number;
}

const ZERO_CENTER = { economicLean: 0, socialLean: 0, displayLean: 0 };

export function countryLeanScale(parties: readonly PartyLabelSource[]): CountryLeanScale {
  const main = mainPartiesFor(parties);
  if (!main) return { main: null, center: ZERO_CENTER };
  const low = parties.find((p) => p.id === main.low.id);
  const high = parties.find((p) => p.id === main.high.id);
  if (
    low?.economicPosition == null ||
    low.socialPosition == null ||
    high?.economicPosition == null ||
    high.socialPosition == null
  ) {
    return { main, center: { ...ZERO_CENTER, displayLean: main.evenSplit } };
  }
  return {
    main,
    center: {
      economicLean: (low.economicPosition + high.economicPosition) / 2,
      socialLean: (low.socialPosition + high.socialPosition) / 2,
      displayLean: main.evenSplit,
    },
  };
}

export function regionLeanDisplay(
  scale: CountryLeanScale,
  economicLean: number,
  socialLean: number
): RegionLeanDisplay {
  const displayLean = getDisplayLean(economicLean, socialLean);
  return {
    label: regionLeanLabel(displayLean, scale.main),
    economicTone: economicLean - scale.center.economicLean,
    socialTone: socialLean - scale.center.socialLean,
    displayTone: displayLean - scale.center.displayLean,
  };
}
