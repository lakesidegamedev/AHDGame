/**
 * Transition package for the funded-market cutover (phase E, owner decisions
 * 2026-10-20). One rule for every industry, no industry lists:
 *
 * - A sector is over-built when its funded revenue over the last few shadow
 *   turns is under a share of its legacy revenue. The classification is frozen
 *   into the reviewed opening plan and never moves afterwards.
 * - Over-built sectors get a fixed window after the switch: free conversion at
 *   book value, mothball with no upkeep, and a revenue floor that fades from
 *   full to nothing across the window.
 * - The floor is paid only from public funding that would otherwise be burned
 *   at close, pro rata within each country, so no money is created.
 *
 * Pure: plain data in, plain data out.
 */

/** Funded revenue below this share of legacy revenue marks a sector over-built. */
export const TRANSITION_MISMATCH_SHARE = 0.6;
/** Shadow turns averaged for the classification. */
export const TRANSITION_BASIS_TURNS = 5;
/** Share of a fully claimed pool held back so float error never overdraws it. */
export const POOL_FLOAT_MARGIN = 1e-9;
/** Turns the package runs after the first funded turn. */
export const TRANSITION_WINDOW_TURNS = 24;
/** Capacity built after this turn chased the reverted advertising spike; reported only. */
export const TRANSITION_SPIKE_COHORT_AFTER_TURN = 314;

export interface SectorRevenueSample {
  /** Legacy revenue, anchor per turn. */
  legacy: number;
  /** Funded (shadow) revenue for the same turn, anchor per turn. */
  funded: number;
}

export interface SectorTransition {
  mismatched: boolean;
  /** Mean legacy revenue over the basis turns, anchor per turn: the floor's reference. */
  legacyRevenueAnchor: number;
  /** Mean funded revenue over the basis turns, anchor per turn. */
  fundedRevenueAnchor: number;
  /** Turns of evidence behind the classification. */
  basisTurns: number;
}

/**
 * Classify one sector from its most recent samples (newest last). A sector with
 * no legacy revenue has nothing to land from and is never mismatched. Fewer
 * samples than the basis still classify; the count is recorded.
 */
export function classifySector(samples: readonly SectorRevenueSample[]): SectorTransition {
  const basis = samples
    .filter((s) => Number.isFinite(s.legacy) && Number.isFinite(s.funded))
    .slice(-TRANSITION_BASIS_TURNS);
  if (basis.length === 0)
    return { mismatched: false, legacyRevenueAnchor: 0, fundedRevenueAnchor: 0, basisTurns: 0 };
  const legacy = basis.reduce((s, x) => s + Math.max(0, x.legacy), 0) / basis.length;
  const funded = basis.reduce((s, x) => s + Math.max(0, x.funded), 0) / basis.length;
  return {
    mismatched: legacy > 0 && funded < TRANSITION_MISMATCH_SHARE * legacy,
    legacyRevenueAnchor: legacy,
    fundedRevenueAnchor: funded,
    basisTurns: basis.length,
  };
}

/** True from the first funded turn through the last turn of the window. */
export function inTransitionWindow(turn: number, firstFundedTurn: number): boolean {
  return turn >= firstFundedTurn && turn < firstFundedTurn + TRANSITION_WINDOW_TURNS;
}

/**
 * The transition package's free conversion (owner decision 2026-10-20: free,
 * at book value, same or another industry): once per mismatched sector, while
 * the window is open for the turn the change takes effect.
 */
export function freeTransitionConversion(
  sector: { cutoverTransition?: SectorTransition | null; cutoverConvertedAtTurn?: number | null },
  effectiveTurn: number,
  firstFundedTurn: number | undefined
): boolean {
  return (
    firstFundedTurn != null &&
    sector.cutoverTransition?.mismatched === true &&
    sector.cutoverConvertedAtTurn == null &&
    inTransitionWindow(effectiveTurn, firstFundedTurn)
  );
}

/** Floor weight: 1 on the first funded turn, falling linearly to 0 at the window's end. */
export function landingWeight(turn: number, firstFundedTurn: number): number {
  if (!inTransitionWindow(turn, firstFundedTurn)) return 0;
  return Math.max(0, 1 - (turn - firstFundedTurn) / TRANSITION_WINDOW_TURNS);
}

export interface SupportClaim {
  sectorId: string;
  countryId: string;
  /** Anchor per turn. */
  claim: number;
}

/**
 * Each running, mismatched, unconverted sector claims the faded gap between its
 * legacy revenue and what it actually sold. Claims are paid pro rata from the
 * country's unspent public funding; nothing beyond that pool is paid.
 */
export function transitionSupport(input: {
  turn: number;
  firstFundedTurn: number;
  sectors: readonly {
    sectorId: string;
    countryId: string;
    transition: SectorTransition | null | undefined;
    settledRevenue: number;
    mothballed: boolean;
    converted: boolean;
  }[];
  /** Unspent public funding per country, anchor. */
  poolByCountry: ReadonlyMap<string, number>;
}): { payments: SupportClaim[]; coverageByCountry: Map<string, number> } {
  const w = landingWeight(input.turn, input.firstFundedTurn);
  const claims: SupportClaim[] = [];
  if (w > 0)
    for (const s of input.sectors) {
      if (!s.transition?.mismatched || s.mothballed || s.converted) continue;
      const gap = Math.max(0, s.transition.legacyRevenueAnchor - Math.max(0, s.settledRevenue));
      const claim = w * gap;
      if (claim > 0) claims.push({ sectorId: s.sectorId, countryId: s.countryId, claim });
    }
  const claimed = new Map<string, number>();
  for (const c of claims) claimed.set(c.countryId, (claimed.get(c.countryId) ?? 0) + c.claim);
  const coverageByCountry = new Map<string, number>();
  for (const [country, total] of claimed) {
    const pool = Math.max(0, input.poolByCountry.get(country) ?? 0);
    // A partly covered pool pays out all of it, so float error in the shares
    // could ask for a hair more than the wallet holds and the debit's balance
    // guard would refuse it. Keep a negligible share back; it is returned with
    // the rest of the unspent funding.
    coverageByCountry.set(
      country,
      total > 0 ? (pool < total ? (pool / total) * (1 - POOL_FLOAT_MARGIN) : 1) : 1
    );
  }
  const payments = claims
    .map((c) => ({ ...c, claim: c.claim * (coverageByCountry.get(c.countryId) ?? 0) }))
    .filter((c) => c.claim > 0)
    .sort((a, b) => (a.sectorId < b.sectorId ? -1 : 1));
  return { payments, coverageByCountry };
}

/**
 * Whether a shadow turn is settled enough to classify from: a run's first
 * turns spend the household opening cushion, which inflates funded revenue
 * and would hide over-built sectors. Run ids end in `:r<first turn>`.
 */
export function shadowTurnSettled(
  runId: string | undefined,
  turn: number,
  cushionTurns: number
): boolean {
  const match = /:r(\d+)$/.exec(runId ?? "");
  if (!match) return false;
  return turn - Number(match[1]) >= cushionTurns;
}
