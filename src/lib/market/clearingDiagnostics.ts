import type { ClearingBookDiagnostic } from "@/lib/market/clearingTypes";

export /**
 * Own-fill feedback thresholds for autoPosture (clearing collapse remediation,
 * 2026-07-06 t879 clone A/B). The aggregate d/s heuristic is blind to the
 * seller's own order-book outcome: a sector can detect a shortage, post +0.1,
 * sell last under cheapest-first, and keep skimming forever while its fill
 * rate sits near zero. These thresholds make the autopilot read its own
 * lagged soldFraction before it prices.
 */
const AUTO_POSTURE_FILL_CHASE = 0.35;

export const AUTO_POSTURE_FILL_HEALTHY = 0.7;

/**
 * Automated posture for NPP/unowned sellers: skim into shortages, undercut
 * into gluts, sit at market when balanced. Milder than the player range so
 * players can always out-position the AI.
 *
 * `lastSoldFraction` gates the aggregate heuristic: a seller that failed to
 * clear its book must not skim, and one that barely sold undercuts to chase
 * volume. Survival beats margin for an unmanaged corp.
 */
export function autoPosture(
  demandUnits: number,
  supplyUnits: number,
  lastSoldFraction?: number | null
): number {
  // Own-fill feedback first: our actual outcome trumps the aggregate signal.
  if (typeof lastSoldFraction === "number" && Number.isFinite(lastSoldFraction)) {
    if (lastSoldFraction < AUTO_POSTURE_FILL_CHASE) return -0.1;
    if (lastSoldFraction < AUTO_POSTURE_FILL_HEALTHY) {
      // Not selling well enough to skim — at most match the market.
      return Math.min(0, autoPostureFromBalance(demandUnits, supplyUnits));
    }
  }
  return autoPostureFromBalance(demandUnits, supplyUnits);
}

export /** The original aggregate-balance heuristic (no own-fill signal). */
function autoPostureFromBalance(demandUnits: number, supplyUnits: number): number {
  if (!(supplyUnits > 0) || !(demandUnits > 0)) return 0;
  const ds = demandUnits / supplyUnits;
  if (ds > 1.2) return 0.1;
  if (ds < 0.8) return -0.1;
  return 0;
}

export /**
 * Clearing book invariant: after normalization the offered book and the lagged
 * supply ledger MUST be in one canonical basis. The basis fix
 * (canonicalPlantsUnitsForCommodity on both sides) makes them comparable; this
 * predicate is the backstop that names residual drift.
 *
 * Two gates, both required. First MATERIALITY: the absolute gap must reach
 * MIN_MATERIAL_BOOK_GAP units. A sub-gap excess cannot move fills or prices:
 * pinned books run in the thousands, so a gap two orders below that is
 * mix-rounding and scope noise, never a defect. Second GROWTH: legitimate
 * one-turn growth cannot double an established book (builds land over many
 * turns, the policy output curve caps at +15%), so an excess past 2x is a
 * basis breach. A material book against a zero (or missing) lagged baseline
 * breaches: canonicalization leaves no legitimate way to offer thousands of
 * units the ledger never saw.
 */
const CLEARING_BOOK_INVARIANT_MIN_MATERIAL_GAP = 250;

export const CLEARING_BOOK_INVARIANT_MAX_GROWTH_FACTOR = 2;

/** Pure predicate behind ClearingBookDiagnostic.invariantBreach. */
export function isClearingBookBreach(
  normalizedOfferedUnits: number,
  laggedSupply: number
): boolean {
  if (!(
    typeof normalizedOfferedUnits === "number" &&
    Number.isFinite(normalizedOfferedUnits) &&
    typeof laggedSupply === "number" &&
    Number.isFinite(laggedSupply)
  )) {
    return false;
  }
  if (normalizedOfferedUnits - laggedSupply < CLEARING_BOOK_INVARIANT_MIN_MATERIAL_GAP) {
    return false;
  }
  if (laggedSupply <= 0) return true;
  return normalizedOfferedUnits > laggedSupply * CLEARING_BOOK_INVARIANT_MAX_GROWTH_FACTOR;
}

/**
 * Deterministic warning text for one breached book. Pure: the same diagnostic
 * always yields the same string, so turn replays and retries cannot duplicate
 * or drop it.
 */
export function describeClearingBookBreach(d: ClearingBookDiagnostic): string {
  const book = d.group ? d.commodity + "@" + d.group : d.commodity;
  const ratio =
    d.laggedSupply > 0 ? d.normalizedOfferedUnits / d.laggedSupply : Number.POSITIVE_INFINITY;
  return (
    "clearing invariant breach on " +
    book +
    ": normalized " +
    Math.round(d.normalizedOfferedUnits) +
    " vs lagged supply " +
    Math.round(d.laggedSupply) +
    " (" +
    (Number.isFinite(ratio) ? ratio.toFixed(1) : "inf") +
    "x; raw " +
    Math.round(d.rawOfferedUnits) +
    ")"
  );
}
