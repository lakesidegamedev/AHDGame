/**
 * Opening price reset for the funded producer market.
 *
 * A rebuilt economy's last legacy turn leaves every commodity priced well above
 * base with scarcity memory to match. The funded market reads those prices as
 * its starting signal, so corporations chase whichever sector looks dearest.
 * This plans the patch that puts every price leg back at nominal base and every
 * scarcity multiplier at neutral. Hard pegs stay; one-shot nudges are not
 * touched here at all.
 */
import { attributeCommodityPrice } from "@/lib/market/priceAttribution";
import type { CommodityPriceAttribution } from "@/lib/market/priceAttribution";

export interface OpeningPriceDoc {
  commodity: string;
  globalPrice?: number;
  statePrices?: Record<string, number>;
  nationalPrices?: Record<string, number>;
  reachablePrices?: Record<string, number>;
  scarcityMult?: number;
  scarcityMultByCountry?: Record<string, number>;
  scarcityImbalanceHistory?: number[];
  scarcityImbalanceHistoryByCountry?: Record<string, number[]>;
  hardPeg?: number | null;
  stateHardPegs?: Record<string, number>;
  priceAttribution?: CommodityPriceAttribution;
}

export interface OpeningPricePatch {
  set: Record<string, unknown>;
  unset: string[];
  changed: boolean;
  /** Price cells held at a peg instead of base. */
  pegsKept: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function sameNumber(a: unknown, b: number): boolean {
  return typeof a === "number" && Math.abs(a - b) < 0.005;
}

/** The whole map at its targets, or null when every entry already matches. */
function levelMap(
  current: Record<string, number> | undefined,
  target: (key: string) => number,
  exact = false
): Record<string, number> | null {
  if (!current) return null;
  const next: Record<string, number> = {};
  let differs = false;
  for (const [key, value] of Object.entries(current)) {
    const wanted = target(key);
    next[key] = wanted;
    if (exact ? value !== wanted : !sameNumber(value, wanted)) differs = true;
  }
  return differs ? next : null;
}

/** Patch that returns one commodity's stored prices and scarcity memory to base. */
export function planOpeningPriceReset(
  doc: OpeningPriceDoc,
  realBasePrice: number,
  nominalIndex: number
): OpeningPricePatch {
  const nominalBase = round2(realBasePrice * nominalIndex);
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  let pegsKept = 0;

  const hardPeg = typeof doc.hardPeg === "number" ? doc.hardPeg : undefined;
  const globalTarget = hardPeg ?? nominalBase;
  if (hardPeg !== undefined) pegsKept += 1;
  if (!sameNumber(doc.globalPrice, globalTarget)) set.globalPrice = globalTarget;

  const statePegs = doc.stateHardPegs ?? {};
  const statePrices = levelMap(doc.statePrices, (state) => {
    const peg = statePegs[state];
    if (typeof peg !== "number") return nominalBase;
    pegsKept += 1;
    return peg;
  });
  if (statePrices) set.statePrices = statePrices;
  const nationalPrices = levelMap(doc.nationalPrices, () => nominalBase);
  if (nationalPrices) set.nationalPrices = nationalPrices;
  const reachablePrices = levelMap(doc.reachablePrices, () => globalTarget);
  if (reachablePrices) set.reachablePrices = reachablePrices;

  if (typeof doc.scarcityMult === "number" && doc.scarcityMult !== 1) set.scarcityMult = 1;
  const byCountry = levelMap(doc.scarcityMultByCountry, () => 1, true);
  if (byCountry) set.scarcityMultByCountry = byCountry;

  if ((doc.scarcityImbalanceHistory?.length ?? 0) > 0) unset.push("scarcityImbalanceHistory");
  if (Object.keys(doc.scarcityImbalanceHistoryByCountry ?? {}).length > 0)
    unset.push("scarcityImbalanceHistoryByCountry");

  if (doc.priceAttribution) {
    const attribution = attributeCommodityPrice({
      realBasePrice,
      nominalBasePrice: nominalBase,
      scarcityAdjustedBasePrice: nominalBase,
      effectiveBasePrice: nominalBase,
      marketTargetPrice: nominalBase,
      driftedPrice: nominalBase,
      appliedPrice: globalTarget,
    });
    if (JSON.stringify(attribution) !== JSON.stringify(doc.priceAttribution))
      set.priceAttribution = attribution;
  }

  return { set, unset, changed: Object.keys(set).length > 0 || unset.length > 0, pegsKept };
}
