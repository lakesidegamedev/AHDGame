/**
 * Portable rules for player acquisition of AI-run (NPP) corporations (#217).
 *
 * Pure data in, plain data out: no database, no clock, no randomness, no
 * environment. The shell (`acquisitionOffers.ts`) loads the documents, calls
 * these, and writes the results back.
 *
 * An NPP-run target has no human CEO who can press "Accept", so a qualifying
 * offer auto-resolves deterministically against the existing reference
 * valuation anchor: accept at or above a modest premium over fair value,
 * reject below it. The premium is the friction against cheap roll-ups of
 * small NPP corps; concentration and bank-charter concerns stay with the
 * existing merger-review gate and executor guards, which run unchanged.
 */

export const NPP_ACQUISITION_PREMIUM_MULTIPLIER = 1.1;

/** Minimal shape the classifier needs; deliberately not the full Corporation. */
export interface NppAcquisitionTargetLike {
  ceoType?: "character" | "imperial" | "npp";
  /** Present while a player-appointed NPP caretaker runs a player-owned corp. */
  caretakerCeo?: unknown;
}

/**
 * Whether an offer against this target auto-resolves instead of waiting for a
 * human "Accept". True only for genuinely AI-run corps: `ceoType "npp"`
 * without a caretaker overlay. Caretaker-run corps stay player property, so
 * they keep the pending offer + owner notification flow.
 */
export function isNppAutoResolvableTarget(target: NppAcquisitionTargetLike): boolean {
  return target.ceoType === "npp" && !target.caretakerCeo;
}

/**
 * The asking price (anchor units) for an NPP-run target at the given reference
 * valuation: the valuation plus the NPP premium, rounded up so a fractional
 * premium never resolves below fair value plus premium.
 */
export function nppAcquisitionMinimumPrice(targetValuationAnchor: number): number {
  if (!Number.isFinite(targetValuationAnchor) || targetValuationAnchor <= 0) return 0;
  return Math.ceil(targetValuationAnchor * NPP_ACQUISITION_PREMIUM_MULTIPLIER);
}

/** Deterministic price gate: accept iff the offered price meets the asking price. */
export function meetsNppAcquisitionThreshold(
  priceAnchor: number,
  targetValuationAnchor: number
): boolean {
  if (!Number.isFinite(priceAnchor)) return false;
  return priceAnchor >= nppAcquisitionMinimumPrice(targetValuationAnchor);
}

/**
 * The lowest price a player-run target may be bought for (anchor units): its
 * cash plus the exit value of its other assets. An acquisition moves the
 * target's cash to the acquirer, so a lower price turns the deal into a way to
 * lift cash out of a company for less than it holds, for example a shell that
 * was just floated to the market pool.
 */
export function playerAcquisitionMinimumPrice(input: {
  cashAnchor: number;
  otherAssetsAnchor: number;
  portfolioAnchor?: number;
  bankEquityAnchor?: number;
  debtAnchor?: number;
}): number {
  const part = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  return Math.max(
    0,
    Math.ceil(
      (Number.isFinite(input.cashAnchor) ? input.cashAnchor : 0) +
        part(input.otherAssetsAnchor) +
        part(input.portfolioAnchor ?? 0) +
        (Number.isFinite(input.bankEquityAnchor) ? input.bankEquityAnchor! : 0) -
        part(input.debtAnchor ?? 0)
    )
  );
}

/** Minimal shape for the same-turn guard. */
export interface AcquisitionAgeTargetLike {
  foundedAtTurn?: number | null;
  lastIpoTurn?: number | null;
}

/**
 * A company founded or floated this turn cannot be acquired until the next
 * turn: founding money and fresh float proceeds should not pass to a buyer
 * before the company has run a single turn.
 */
export function acquisitionBlockedAsNewThisTurn(
  target: AcquisitionAgeTargetLike,
  currentTurn: number
): boolean {
  return target.foundedAtTurn === currentTurn || target.lastIpoTurn === currentTurn;
}

/** Portable investment/debt accounting. All FX rates are local units per anchor. */
export function acquisitionBalanceSheet(input: {
  cashAnchor: number;
  sectorsAnchor: number;
  bankEquityAnchor: number;
  fundsAnchor: number;
  receivablesAnchor: number;
  facilityDebtLocal: number;
  facilityFxRate: number;
  heldBonds: { units: number; faceValue: number; marketPrice: number; fxRate: number }[];
  heldShares: { shares: number; sharePrice: number; fxRate: number }[];
  issuedBonds: { principalLocal: number; fxRate: number }[];
}): { portfolioAnchor: number; debtAnchor: number; minimumPriceAnchor: number } {
  const convert = (local: number, rate: number) => {
    if (!Number.isFinite(local) || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Cannot price an acquisition with incomplete financial values.");
    return local / rate;
  };
  const portfolioAnchor =
    input.fundsAnchor +
    input.receivablesAnchor +
    input.heldBonds.reduce(
      (sum, p) => sum + convert(p.units * p.faceValue * p.marketPrice, p.fxRate),
      0
    ) +
    input.heldShares.reduce((sum, p) => sum + convert(p.shares * p.sharePrice, p.fxRate), 0);
  const debtAnchor =
    convert(input.facilityDebtLocal, input.facilityFxRate) +
    input.issuedBonds.reduce((sum, p) => sum + convert(p.principalLocal, p.fxRate), 0);
  if (
    ![
      input.cashAnchor,
      input.sectorsAnchor,
      input.bankEquityAnchor,
      portfolioAnchor,
      debtAnchor,
    ].every(Number.isFinite)
  )
    throw new Error("Cannot price an acquisition with incomplete balance-sheet values.");
  return {
    portfolioAnchor,
    debtAnchor,
    minimumPriceAnchor: playerAcquisitionMinimumPrice({
      cashAnchor: input.cashAnchor,
      otherAssetsAnchor: input.sectorsAnchor,
      portfolioAnchor,
      bankEquityAnchor: input.bankEquityAnchor,
      debtAnchor,
    }),
  };
}
