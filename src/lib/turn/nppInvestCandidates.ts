/** Candidate scoring and sizing for NPP bond and stock surplus investing. */
import type { Bond } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { politeFloatLimit } from "@/lib/nppAutonomy/playerImpactBudget";
import type { Corporation } from "@/lib/db/types/corporation";
import { resolveShareExecutionPrice } from "@/lib/corporations/marketExecution";

// v3 bond investment: each cycle, an NPP with savings above the reserve floor
// rolls a per-archetype-scaled chance (riskToleranceMult) to move a fraction
// of savings above that floor into an available home-currency bond. Deducted
// from savings, not funds — a risk-bearing allocation of money already set
// aside, not campaign war-chest spending. Base rate kept low: this runs
// against a shared, finite public float across every acting NPP in a
// country, so an aggressive default could drain it in one cycle.
export const NPP_BOND_INVEST_RESERVE_FLOOR = 5_000;

export const NPP_BOND_INVEST_BASE_PROBABILITY = 0.05;

export const NPP_BOND_INVEST_FRACTION = 0.25;

export const NPP_BOND_CANDIDATE_POOL = 5;

// Current yield below which an NPP simply doesn't buy. Gives "hold cash" a place
// in the decision instead of always allocating. In PERCENT: `couponRate` is an
// annual rate in percent (3.5 = 3.5%) and `marketPrice` is a fraction of face
// (1.0 = par), so couponRate ÷ marketPrice is also a percent.
export const NPP_BOND_MIN_YIELD_PCT = 1.0;

// Stock value signal: fundamentalSharePrice ÷ execution price, so 1.0 means the
// share trades exactly at fundamentals and below 1.0 means it's expensive. This
// is the floor a middling NPP demands; risk tolerance scales it, clamped so a
// cautious NPP asks for no better than par (never an impossible bar) and an
// aggressive one will pay up to double fundamentals.
export const NPP_STOCK_MIN_VALUE_RATIO = 0.8;

export const NPP_STOCK_VALUE_FLOOR_MIN = 0.5;

export const NPP_STOCK_VALUE_FLOOR_MAX = 1.0;

// How many corps (by market cap) enter the weighted sample. The live iteration-4
// market put 70% of tradable capitalization in five firms while profitable
// smaller issuers received little autonomous demand. Thirty-two keeps the query
// bounded while giving the long tail a real chance to attract capital.
export const NPP_STOCK_CANDIDATE_POOL = 32;

// v3 stock investment: same shape as the bond sweep above, run as a separate
// gate immediately after it so an NPP can end up allocating to both in one
// cycle (each draws from whatever savings remain above the floor at the time
// it runs — sequential, same document, no double-count risk). A modestly
// stronger buy cadence than the bond sweep gives equities a structural expansion
// bias, but every purchase remains funded from accumulated investment cash.
export const NPP_STOCK_INVEST_RESERVE_FLOOR = 5_000;

export const NPP_STOCK_INVEST_BASE_PROBABILITY = 0.075;

export const NPP_STOCK_INVEST_FRACTION = 0.3;

/** Score an equity candidate without letting mega-cap size swamp value. */
export function nppStockCandidateWeight(
  marketCap: number,
  valueRatio: number,
  riskToleranceMult: number
): number {
  const safeMarketCap = Number.isFinite(marketCap) ? Math.max(marketCap, 1) : 1;
  const safeValueRatio = Number.isFinite(valueRatio) ? Math.max(valueRatio, 0) : 1;
  const safeRiskTolerance = Number.isFinite(riskToleranceMult) ? Math.max(riskToleranceMult, 0) : 1;
  return Math.pow(safeMarketCap, 0.25) * Math.pow(safeValueRatio, safeRiskTolerance);
}

/** A bond on offer to an NPP, with its current yield in percent. */
export type ScoredBond = { bond: Bond; yield: number };

/**
 * The bonds an NPP of `countryId` can buy, best current yield first, cut to
 * the sampling pool. Candidate selection used to be "always the single
 * highest couponRate bond in the country", which meant every NPP in a country
 * bought the same issue. Ranking by CURRENT yield (coupon relative to what the
 * bond actually costs) is the number an investor would care about.
 */
export function bondCandidates(
  bonds: readonly Bond[],
  countryId: CountryId,
  homeCurrency: string
): ScoredBond[] {
  return bonds
    .filter(
      (b) =>
        (b.currencyCode ?? COUNTRY_CURRENCY_MAP[countryId] ?? "USD") === homeCurrency &&
        b.publicFloat > 0 &&
        b.marketPrice > 0
    )
    .map((b) => ({ bond: b, yield: b.couponRate / b.marketPrice }))
    .sort((a, b) => b.yield - a.yield)
    .slice(0, NPP_BOND_CANDIDATE_POOL);
}

/**
 * Index drawn from `weights` by a uniform `roll` in [0, 1): walk the
 * cumulative weight, falling back to the last entry on rounding.
 */
export function pickIndexByWeight(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let remaining = roll * total;
  for (let i = 0; i < weights.length; i++) {
    remaining -= weights[i];
    if (remaining <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Units of `bond` an NPP buys. Sized in ₳, then converted to LOCAL to count
 * units at local prices. saveInvestAppetiteMult varies the SIZE: stewards
 * (0.8) commit roughly double what reformers (0.3) do. Never clears an issue:
 * a reserve of the float is left so a player always has something to buy.
 */
export function bondBuyUnits(
  cashAnchor: number,
  saveInvestAppetiteMult: number,
  homeRate: number,
  bond: Pick<Bond, "marketPrice" | "publicFloat">
): number {
  const appetite = Math.min(Math.max(saveInvestAppetiteMult / 0.4, 0.5), 2.0);
  const investAmountAnchor =
    (cashAnchor - NPP_BOND_INVEST_RESERVE_FLOOR) * NPP_BOND_INVEST_FRACTION * appetite;
  const investAmountLocal = investAmountAnchor * (homeRate > 0 ? homeRate : 1);
  const unitCost = BOND_UNIT_FACE_VALUE * bond.marketPrice;
  return Math.min(Math.floor(investAmountLocal / unitCost), politeFloatLimit(bond.publicFloat));
}

/** Fields loaded per candidate corp for stock-sweep selection; keeps the find() projection tight. */
export type StockCandidateCorp = Pick<
  Corporation,
  | "_id"
  | "countryId"
  | "isPrivate"
  | "isNationalized"
  | "countryOwnerId"
  | "liquidCurrencyCode"
  | "sharePrice"
  | "fundamentalSharePrice"
  | "totalShares"
  | "publicFloat"
  | "shareBuybackMode"
>;

/** A listed corporation on offer to an NPP, priced and valued. */
export type ScoredStock = {
  corp: StockCandidateCorp;
  price: number;
  valueRatio: number;
  marketCap: number;
};

/**
 * The least fundamental-to-price ratio an NPP accepts. Risk tolerance relaxes
 * the "don't overpay" floor: a cautious NPP wants the share at or below
 * fundamentals, an aggressive one will pay well above. Clamped at 1.0 so the
 * cautious end never becomes a bar nothing clears, and so a corp with no
 * `fundamentalSharePrice` (ratio defaults to 1) is always eligible rather than
 * silently excluded from every NPP's universe.
 */
export function stockMinValueRatio(riskToleranceMult: number): number {
  return Math.min(
    Math.max(NPP_STOCK_MIN_VALUE_RATIO * (2 - riskToleranceMult), NPP_STOCK_VALUE_FLOOR_MIN),
    NPP_STOCK_VALUE_FLOOR_MAX
  );
}

/**
 * The corporations an NPP may buy: the top of its market by size in its home
 * currency, scored on value (fundamentalSharePrice / execution price), and
 * kept only where the value clears this NPP's floor. Selection used to be the
 * single largest corp, forever; risk-tolerant NPPs now weight size and chase
 * momentum, cautious ones weight the discount and refuse to overpay.
 */
export function stockCandidates(
  corps: readonly StockCandidateCorp[],
  homeCurrency: string,
  riskToleranceMult: number
): ScoredStock[] {
  const minValueRatio = stockMinValueRatio(riskToleranceMult);
  return corps
    .filter((c) => (c.liquidCurrencyCode ?? "USD") === homeCurrency && (c.publicFloat ?? 0) > 0)
    .slice(0, NPP_STOCK_CANDIDATE_POOL)
    .map((c) => {
      const price = resolveShareExecutionPrice(c);
      const marketCap = (c.sharePrice ?? 0) * (c.totalShares ?? 0);
      const valueRatio = price > 0 ? (c.fundamentalSharePrice ?? price) / price : 0;
      return { corp: c, price, valueRatio, marketCap };
    })
    .filter((s) => s.price > 0 && s.valueRatio >= minValueRatio);
}

/** Weighted draw over the candidates from a uniform `roll` in [0, 1). */
export function pickStockCandidate(
  candidates: readonly ScoredStock[],
  riskToleranceMult: number,
  roll: number
): number {
  return pickIndexByWeight(
    candidates.map((s) => nppStockCandidateWeight(s.marketCap, s.valueRatio, riskToleranceMult)),
    roll
  );
}

/**
 * Shares an NPP buys. Sized in ₳, then converted to LOCAL to count shares at
 * local prices, leaving a reserve of the float untouched (see the bond sweep).
 */
export function stockBuyShares(
  cashAnchor: number,
  saveInvestAppetiteMult: number,
  homeRate: number,
  chosen: Pick<ScoredStock, "corp" | "price">
): number {
  const appetite = Math.min(Math.max(saveInvestAppetiteMult / 0.4, 0.5), 2.0);
  const investAmountAnchor =
    (cashAnchor - NPP_STOCK_INVEST_RESERVE_FLOOR) * NPP_STOCK_INVEST_FRACTION * appetite;
  const investAmountLocal = investAmountAnchor * (homeRate > 0 ? homeRate : 1);
  return Math.min(
    Math.floor(investAmountLocal / chosen.price),
    politeFloatLimit(chosen.corp.publicFloat ?? 0)
  );
}
