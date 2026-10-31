/**
 * FX defence prices only useful movement toward a band, using market depth,
 * credibility and a per-turn reserve budget. Funding exchanges equal anchor
 * value between domestic and foreign pools; it never manufactures reserves.
 */
import {
  VOLUME_PRESSURE_CAP,
  VOLUME_DIRECTION_WEIGHT,
  VOLUME_PRESSURE_SENSITIVITY,
} from "@/lib/constants/currencies";

export const DEFENCE_MAX_PRESSURE = VOLUME_PRESSURE_CAP * VOLUME_DIRECTION_WEIGHT;
const DEFENCE_MIN_MARKET_DEPTH = 20_000_000;
const DEFENCE_DEFAULT_RESERVE_BUDGET = 0.1;
const PEG_DEFENCE_TOLERANCE = 0.0005;

export interface DefencePolicy {
  floor: number;
  ceiling: number;
  /** Maximum home-currency reserve draw per turn; absent uses the automatic budget. */
  maxSpendPerTurn?: number;
}

export interface DefenceMarket {
  /** Organic quote before the final guardrail clamp, with the same noise as settlement. */
  rawRate: number;
  organicPressure: number;
  hardFloor: number;
  hardCeiling: number;
  homeRate: number;
  marketDepthAnchor: number;
  adherence: number;
}

export interface DefenceReserves {
  homeCurrency: string;
  balances: Readonly<Record<string, number | undefined>>;
  rates: Readonly<Record<string, number | undefined>>;
  forexRevenue: number;
  reserveBalance: number;
}

const positive = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function defenceMarketDepth(buy: number, sell: number): number {
  return Math.max(DEFENCE_MIN_MARKET_DEPTH, positive(buy) + positive(sell));
}

export function defenceBounds(policy: DefencePolicy) {
  return policy.floor === policy.ceiling
    ? {
        floor: policy.floor * (1 - PEG_DEFENCE_TOLERANCE),
        ceiling: policy.ceiling * (1 + PEG_DEFENCE_TOLERANCE),
      }
    : { floor: policy.floor, ceiling: policy.ceiling };
}

export function defenceLiquidity(r: DefenceReserves): { buy: number; sell: number } {
  let buy = 0;
  for (const [currency, balance] of Object.entries(r.balances)) {
    if (currency !== r.homeCurrency && positive(r.rates[currency])) {
      buy += positive(balance) / positive(r.rates[currency]);
    }
  }
  const homeRate = positive(r.rates[r.homeCurrency]);
  const hasCounterCurrency = Object.entries(r.rates).some(
    ([currency, rate]) => currency !== r.homeCurrency && positive(rate) > 0
  );
  return {
    buy,
    sell:
      homeRate && hasCounterCurrency
        ? (positive(r.balances[r.homeCurrency]) +
            positive(r.forexRevenue) +
            positive(r.reserveBalance)) /
          homeRate
        : 0,
  };
}

export function quoteDefence(m: DefenceMarket, p: DefencePolicy, availableAnchor: number) {
  if (
    ![
      m.rawRate,
      m.organicPressure,
      m.hardFloor,
      m.hardCeiling,
      m.homeRate,
      m.marketDepthAnchor,
      m.adherence,
      p.floor,
      p.ceiling,
      availableAnchor,
    ].every(Number.isFinite) ||
    m.rawRate <= 0 ||
    m.homeRate <= 0 ||
    m.hardFloor <= 0 ||
    m.hardCeiling <= m.hardFloor ||
    m.marketDepthAnchor <= 0 ||
    p.floor <= 0 ||
    p.ceiling < p.floor ||
    availableAnchor < 0 ||
    (p.maxSpendPerTurn !== undefined &&
      (!Number.isFinite(p.maxSpendPerTurn) || p.maxSpendPerTurn < 0))
  )
    return null;
  const bounds = defenceBounds(p);
  const unassistedRate = clamp(m.rawRate, m.hardFloor, m.hardCeiling);
  const direction =
    unassistedRate > bounds.ceiling ? "buy" : unassistedRate < bounds.floor ? "sell" : "none";
  const boundary = direction === "buy" ? bounds.ceiling : bounds.floor;
  const adherence = clamp(m.adherence, 0.7, 1);
  const organic = clamp(m.organicPressure, -DEFENCE_MAX_PRESSURE, DEFENCE_MAX_PRESSURE);
  const needed = direction === "none" ? 0 : (1 - organic) * (1 - boundary / m.rawRate);
  const desired =
    direction === "none"
      ? 0
      : clamp(needed, -DEFENCE_MAX_PRESSURE * adherence, DEFENCE_MAX_PRESSURE * adherence);
  const capped = clamp(organic + desired, -DEFENCE_MAX_PRESSURE, DEFENCE_MAX_PRESSURE) - organic;
  const requestedAnchor = (Math.abs(capped) * m.marketDepthAnchor) / adherence;
  const budgetAnchor = Math.min(
    availableAnchor,
    p.maxSpendPerTurn === undefined
      ? availableAnchor * DEFENCE_DEFAULT_RESERVE_BUDGET
      : p.maxSpendPerTurn / m.homeRate
  );
  let spendAnchor = Math.min(requestedAnchor, budgetAnchor);
  let delta = ((Math.sign(capped) * spendAnchor) / m.marketDepthAnchor) * adherence;
  const projectedRate = clamp(
    (m.rawRate * (1 - organic - delta)) / (1 - organic),
    m.hardFloor,
    m.hardCeiling
  );
  if (Math.abs(projectedRate - unassistedRate) <= Math.abs(unassistedRate) * 1e-14) {
    spendAnchor = 0;
    delta = 0;
  }
  return {
    direction,
    unassistedRate,
    projectedRate,
    spendAnchor,
    spendHome: spendAnchor * m.homeRate,
    requestedAnchor,
    budgetAnchor,
    pressure: delta,
    /** The legacy volume channel carries pressure, not the reserve price. */
    syntheticVolume: delta / (VOLUME_PRESSURE_SENSITIVITY * VOLUME_DIRECTION_WEIGHT),
    inBand: projectedRate >= bounds.floor - 1e-12 && projectedRate <= bounds.ceiling + 1e-12,
    budgetLimited: spendAnchor + 1e-9 < requestedAnchor,
    exhausted: direction !== "none" && availableAnchor <= 1e-9,
  };
}

export function planDefenceFunding(
  r: DefenceReserves,
  direction: "buy" | "sell",
  requested: number,
  homeRate: number
) {
  const deltas: Record<string, number> = {};
  let remaining = positive(requested),
    actual = 0,
    forexRevenueDelta = 0,
    reserveBalanceDelta = 0;
  const draw = (currency: string) => {
    const rate = positive(r.rates[currency]);
    if (!rate) return;
    const value = Math.min(positive(r.balances[currency]) / rate, remaining);
    if (value <= 0) return;
    // Dividing and multiplying a fully drawn pool can reconstruct a debit one
    // ulp above its stored balance. Never make the atomic balance guard reject
    // an otherwise valid full draw because of floating-point reconstruction.
    deltas[currency] =
      (deltas[currency] ?? 0) - Math.min(positive(r.balances[currency]), value * rate);
    remaining -= value;
    actual += value;
  };
  if (direction === "buy") {
    const foreign = Object.keys(r.balances)
      .filter((c) => c !== r.homeCurrency && positive(r.rates[c]))
      .sort(
        (a, b) =>
          positive(r.balances[b]) / positive(r.rates[b]) -
            positive(r.balances[a]) / positive(r.rates[a]) || a.localeCompare(b)
      );
    for (const currency of foreign) draw(currency);
    if (actual > 0) deltas[r.homeCurrency] = (deltas[r.homeCurrency] ?? 0) + actual * homeRate;
  } else {
    // Do not debit domestic funds unless a priced foreign counter-asset exists.
    const counter = Object.keys(r.rates)
      .filter((c) => c !== r.homeCurrency && positive(r.rates[c]))
      .sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)))[0];
    if (counter) {
      draw(r.homeCurrency);
      const forex = Math.min(positive(r.forexRevenue) / homeRate, remaining);
      forexRevenueDelta = -Math.min(positive(r.forexRevenue), forex * homeRate);
      remaining -= forex;
      actual += forex;
      const reserve = Math.min(positive(r.reserveBalance) / homeRate, remaining);
      reserveBalanceDelta = -Math.min(positive(r.reserveBalance), reserve * homeRate);
      actual += reserve;
      if (actual > 0)
        deltas[counter] = (deltas[counter] ?? 0) + actual * positive(r.rates[counter]);
    }
  }
  return {
    availableInternal: actual,
    spreadFeeReserveDeltas: deltas,
    forexRevenueDelta,
    reserveBalanceDelta,
    reservesSpentHome: actual * homeRate,
  };
}
