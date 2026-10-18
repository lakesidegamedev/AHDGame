/** Deterministic FX defence sensitivity scenarios; no database or production access. */
import {
  quoteDefence,
  type DefenceMarket,
} from "../../src/lib/currency/intervention/rules/defence";

const baseline: DefenceMarket = {
  rawRate: 1.03,
  organicPressure: 0,
  hardFloor: 0.5,
  hardCeiling: 1.5,
  homeRate: 1,
  marketDepthAnchor: 20_000_000,
  adherence: 1,
};
const costs = [0.001, 0.01, 0.03, 0.1].map((breach) => {
  const q = quoteDefence(
    { ...baseline, rawRate: 1 + breach },
    { floor: 0.99, ceiling: 1 },
    100_000_000
  )!;
  return {
    breachPercent: breach * 100,
    oldRequestedAnchor: breach * 20_000_000,
    newSpendAnchor: q.spendAnchor,
    rate: q.projectedRate,
  };
});
let rate = 1.001,
  oldRate = rate,
  spend = 0,
  oldSpend = 0,
  overshoots = 0;
for (let turn = 0; turn < 48; turn++) {
  const raw = rate + (1 - rate) * 0.075;
  const q = quoteDefence(
    { ...baseline, rawRate: raw },
    { floor: 0.9995, ceiling: 1.0005 },
    100_000_000
  )!;
  rate = q.projectedRate;
  spend += q.spendAnchor;
  if (rate < 0.9995 - 1e-10 || rate > 1.0005 + 1e-10) overshoots++;
  const oldRaw = oldRate + (1 - oldRate) * 0.075;
  const breach =
    oldRaw > 1.0005 ? (oldRaw - 1.0005) / 1.0005 : oldRaw < 0.9995 ? (oldRaw - 0.9995) / 0.9995 : 0;
  const requested = Math.abs(breach) * 20_000_000;
  oldSpend += requested;
  oldRate = oldRaw * (1 - Math.max(-0.01, Math.min(0.01, Math.sign(breach) * requested * 0.00002)));
}
const currencyScale = [0.6, 1, 140].map((homeRate) => {
  const q = quoteDefence(
    {
      ...baseline,
      rawRate: 1.03 * homeRate,
      homeRate,
      hardFloor: 0.5 * homeRate,
      hardCeiling: 1.5 * homeRate,
    },
    { floor: 0.99 * homeRate, ceiling: homeRate },
    100_000_000
  )!;
  return {
    homeRate,
    spendAnchor: q.spendAnchor,
    spendHome: q.spendHome,
    relativeRate: q.projectedRate / homeRate,
  };
});
const depthAndBudget = [20_000_000, 200_000_000, 2_000_000_000].map((marketDepthAnchor) => {
  const q = quoteDefence(
    { ...baseline, marketDepthAnchor },
    { floor: 0.99, ceiling: 1, maxSpendPerTurn: 100_000 },
    10_000_000
  )!;
  return {
    marketDepthAnchor,
    spend: q.spendAnchor,
    rate: q.projectedRate,
    budgetLimited: q.budgetLimited,
  };
});
if (overshoots || currencyScale.some((x) => Math.abs(x.relativeRate - 1.0197) > 1e-9))
  throw new Error("FX simulation invariant failed");
console.log(
  JSON.stringify(
    {
      assumptions:
        "Frozen fundamentals, no organic flow or noise, ample reserves except explicit budgets; sensitivity evidence, not a full-world forecast",
      costs,
      narrowBand48Turns: { oldSpend, newSpend: spend, overshoots, rate },
      currencyScale,
      depthAndBudget,
    },
    null,
    2
  )
);
