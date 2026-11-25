import { it, expect } from "vitest";
import { buildAcquisitionPayoutPlan, type PayoutPlanInput } from "./acquisitionPayoutPlan";

const input = (): PayoutPlanInput => ({
  offerHex: "offer",
  priceAnchor: 100,
  priceInAcquirerCapital: 100,
  acquirerHex: "acquirer",
  acquirerName: "Buyer",
  acquirerCurrency: "USD",
  acquirerForCost: { liquidCurrencyCode: "USD" },
  acquirerFxRate: 1,
  targetHex: "target",
  targetName: "Target",
  targetCountryId: "CA",
  targetLiquidCurrencyCode: "CAD",
  allocation: {
    characterRows: [],
    corporationRows: [],
    fundRows: [],
    nppRows: [],
    publicFloatRow: { payout: 100, shares: 100 },
  },
  currencyByHolderHex: {},
  creditorByHolderHex: {},
  fundsPresentHex: [],
  treasuryPresent: true,
  equityPoolPresent: true,
  fxByCurrency: { USD: 1, CAD: 2 },
  forexEnabled: true,
  shellCashAnchor: 0,
  shellCashInAcquirerCapital: 0,
  shellCashTargetLocal: 0,
  targetCurrency: "CAD",
});
it("refuses a missing payout FX quote before offering any debit plan", () => {
  const value = input();
  value.fxByCurrency = { USD: 1 };
  expect(() => buildAcquisitionPayoutPlan(value)).toThrow();
});
it("pins native payouts and leaves a frozen plan unchanged when live FX drifts", () => {
  const value = input();
  const plan = buildAcquisitionPayoutPlan(value);
  expect(plan.legs.find((leg) => leg.collection === "equityMarketPools")?.inc.cashLocal).toBe(200);
  value.fxByCurrency.CAD = 9;
  expect(plan.legs.find((leg) => leg.collection === "equityMarketPools")?.inc.cashLocal).toBe(200);
});
it("uses anchor payouts when forex is explicitly disabled", () => {
  const value = input();
  value.forexEnabled = false;
  value.fxByCurrency = {};
  expect(
    buildAcquisitionPayoutPlan(value).legs.find((leg) => leg.collection === "equityMarketPools")
      ?.inc.cashLocal
  ).toBe(100);
});
