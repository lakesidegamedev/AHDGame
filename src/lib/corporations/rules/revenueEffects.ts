/**
 * Revenue effects on a funded producer turn. Funded sectors take margin from
 * the settlement receipt, so fit, policy, event and monopoly legs move sold
 * revenue instead: each leg is a percentage of it, and the net is capped.
 * Economy-wide legs (inflation, deficit, debt, default) are left to prices.
 * Subsidies are sized here but credited on their own line, since the
 * government pays them. Pure: plain data in, plain data out.
 */

/** Cap on the net of all revenue effects, as a percentage of sold revenue. */
export const REVENUE_EFFECT_CAP_PCT = 30;

export const REVENUE_EFFECT_KEYS = [
  "stateSpecialization",
  "sectorTypeMatch",
  "homeLocation",
  "economicModel",
  "strategy",
  "typeSwitch",
  "domesticTariff",
  "foreignTariff",
  "exportPremium",
  "expropriationRisk",
  "regulatoryBurden",
  "disaster",
  "regionalCondition",
  "strike",
] as const;

export type RevenueEffectKey = (typeof REVENUE_EFFECT_KEYS)[number];

export const REVENUE_EFFECT_LABELS: Readonly<Record<RevenueEffectKey, string>> = {
  stateSpecialization: "State specialisation",
  sectorTypeMatch: "Sector fit for your company",
  homeLocation: "Home location",
  economicModel: "Economic model alignment",
  strategy: "Strategy change",
  typeSwitch: "Company type switch",
  domesticTariff: "Domestic tariff friction",
  foreignTariff: "Foreign tariff",
  exportPremium: "Export premium",
  expropriationRisk: "Expropriation risk",
  regulatoryBurden: "Monopoly charge",
  disaster: "Local disaster",
  regionalCondition: "Regional conditions",
  strike: "Strike",
};

/** Signed size of each leg in points of sold revenue. Missing or zero legs are skipped. */
export type RevenueEffectLegs = Partial<Record<RevenueEffectKey, number>>;

export interface RevenueEffectLine {
  key: RevenueEffectKey;
  label: string;
  /** Points of sold revenue after the cap scale. */
  pp: number;
  /** Money (same unit as the sold revenue). Lines sum to `totalAmount`. */
  amount: number;
}

export interface RevenueEffectsResult {
  lines: RevenueEffectLine[];
  totalPp: number;
  totalAmount: number;
  /** True when the cap shrank the legs. */
  capped: boolean;
  /** Factor applied to every leg, 1 when uncapped. */
  scale: number;
}

const finite = (x: number | undefined): number =>
  typeof x === "number" && Number.isFinite(x) ? x : 0;

export function computeRevenueEffects(input: {
  soldRevenue: number;
  legs: RevenueEffectLegs;
  capPct?: number;
}): RevenueEffectsResult {
  const sold = Math.max(0, finite(input.soldRevenue));
  const cap = Math.max(0, finite(input.capPct ?? REVENUE_EFFECT_CAP_PCT));
  const raw = REVENUE_EFFECT_KEYS.flatMap((key) => {
    const pp = finite(input.legs[key]);
    return pp === 0 ? [] : [{ key, pp }];
  });
  const rawTotal = raw.reduce((sum, leg) => sum + leg.pp, 0);
  const capped = Math.abs(rawTotal) > cap;
  const scale = capped ? cap / Math.abs(rawTotal) : 1;
  const lines = raw.map(({ key, pp }) => ({
    key,
    label: REVENUE_EFFECT_LABELS[key],
    pp: pp * scale,
    amount: (sold * pp * scale) / 100,
  }));
  return {
    lines,
    totalPp: rawTotal * scale,
    totalAmount: lines.reduce((sum, line) => sum + line.amount, 0),
    capped,
    scale,
  };
}

/** Subsidy the government pays on the sold revenue, from the subsidy leg in points. */
export function subsidyReceived(soldRevenue: number, subsidyPp: number): number {
  return (Math.max(0, finite(soldRevenue)) * Math.max(0, finite(subsidyPp))) / 100;
}
