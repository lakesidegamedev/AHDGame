import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { FundedCountryBookRow } from "./fundedBookRules";

const MINIMUM_UNFILLED_SHARE = 0.25;
const MAXIMUM_DISPATCH_GAIN = 0.5;

/** Convert a material gap in funded country orders to units of work per turn. */
export function fundedFreightGaps(
  books: readonly Pick<FundedCountryBookRow, "countryId" | "commodity" | "funded" | "filled">[]
): ReadonlyMap<string, number> {
  const gaps = new Map<string, number>();
  for (const { countryId, commodity, funded, filled } of books) {
    if (
      commodity !== "freight" ||
      !countryId ||
      funded == null ||
      filled == null ||
      !Number.isFinite(funded) ||
      !Number.isFinite(filled) ||
      funded <= 0 ||
      filled < 0
    )
      continue;
    const gap = funded - filled;
    if (gap >= funded * MINIMUM_UNFILLED_SHARE) gaps.set(countryId, gap / TURNS_PER_DAY);
  }
  return gaps;
}

/** Every eligible depot shares the same uplift so the country opens one gap's worth of work. */
export function fundedFreightDispatchMultiplier(
  gapPerTurn: number,
  plannedFreightUnits: number
): number {
  if (!(gapPerTurn > 0) || !(plannedFreightUnits > 0)) return 1;
  return 1 + Math.min(MAXIMUM_DISPATCH_GAIN, gapPerTurn / plannedFreightUnits);
}
