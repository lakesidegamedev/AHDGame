import { describe, expect, it } from "vitest";
import { buildWikiChart } from "./index";
import { expectValidChart } from "./chartTestUtils";
import { ECONOMY_CORP_CHARTS } from "./economyCorp";
import { sharePriceComponents, sharePriceFromFormula } from "./economyCorpPricing";
import {
  MERGER_REVIEW_THRESHOLD_PERCENT,
  autoResolveDecision,
} from "@/lib/corporations/mergerReview/constants";
import { GROUP_SYNERGY_MAX_SHARE } from "@/lib/corporations/groups/synergies";
import { loyaltyLabel } from "@/lib/market/brandLoyalty";
import { getSprawlModifier } from "@/lib/constants/corporations";
import { unionPremium } from "@/lib/labour/unionization";
import { STRIKE_UNIONIZATION_THRESHOLD } from "@/lib/labour/strikes";
import { COMMAND_CEILING, DUAL_TRACK_CEILING } from "@/lib/constants/commandEconomy";
import { MARKETIZATION_SCHEDULE } from "@/lib/constants/marketizationSchedule";
import { COMMODITY_PRICE_DRIFT_RATE } from "@/lib/constants/commodities";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  blendWeightsForRate,
  domesticMalusForRate,
  foreignMarginModifierForRate,
} from "@/lib/tariffs/rules/tariffCurves";
import { getForeignTariffMarginModifier } from "@/lib/tariffs/tariffEffects";
import { TRADE_EMBARGO_EXPORT_LOSS_SHARE } from "@/lib/trade/constants";

const spec = (id: string) => {
  const s = buildWikiChart(id);
  expect(s, id).not.toBeNull();
  return s!;
};
const yAt = (s: ReturnType<typeof spec>, series: number, x: number) =>
  s.series[series].points.find(([px]) => px === x)?.[1];

describe("economy corporate and markets charts", () => {
  it("all of this area's charts are valid", () => {
    for (const id of Object.keys(ECONOMY_CORP_CHARTS)) expectValidChart(id, spec(id));
  });

  it("merger review follows the auto-resolve bands at every trip level", () => {
    const s = spec("merger-review-timeout-outcomes");
    const trips = MERGER_REVIEW_THRESHOLD_PERCENT.filter((t): t is number => t !== null);
    expect(s.series).toHaveLength(trips.length);
    s.series.forEach((series, i) => {
      for (const [share, code] of series.points) {
        const decision = autoResolveDecision(share, trips[i]);
        const expected = { cleared: 0, clearedWithRemedy: 1, blocked: 2 }[decision];
        expect(code).toBe(expected);
      }
    });
  });

  it("group synergy ceiling marker and series tail follow the constant", () => {
    const s = spec("group-synergy-convergence");
    expect(s.markers?.some((m) => m.y === GROUP_SYNERGY_MAX_SHARE * 100)).toBe(true);
    const last = s.series[0].points[s.series[0].points.length - 1][1];
    expect(last).toBeLessThanOrEqual(GROUP_SYNERGY_MAX_SHARE * 100);
    expect(last).toBeGreaterThan(GROUP_SYNERGY_MAX_SHARE * 100 * 0.9);
  });

  it("brand loyalty tier markers sit exactly where the label changes", () => {
    const s = spec("brand-loyalty-tiers-over-time");
    expect(s.markers!.length).toBeGreaterThan(0);
    for (const m of s.markers!) {
      expect(loyaltyLabel(m.y!)).not.toBe(loyaltyLabel(m.y! - 1));
    }
  });

  it("sprawl series matches the penalty function", () => {
    const s = spec("logistical-sprawl-penalty");
    expect(yAt(s, 1, 30)).toBe(getSprawlModifier(30, 0, true));
    expect(yAt(s, 0, 40)).toBe(getSprawlModifier(40, 0, false));
  });

  it("union premium and strike marker follow the labour constants", () => {
    const s = spec("union-labour-premium");
    expect(yAt(s, 0, 50)).toBe(unionPremium(50));
    expect(s.markers![0].x).toBe(STRIKE_UNIONIZATION_THRESHOLD);
  });

  it("share price components add up to the real formula", () => {
    for (const pct of [6, 10, 12, 16]) {
      const c = sharePriceComponents(pct / 100);
      expect(c.book + c.earningsPower + c.growthPremium).toBeCloseTo(
        sharePriceFromFormula(pct / 100),
        1
      );
    }
  });

  it("commodity gap closure uses the drift rate", () => {
    const s = spec("commodity-price-gap-closure");
    expect(yAt(s, 0, TURNS_PER_YEAR)).toBeCloseTo(
      100 * Math.pow(1 - COMMODITY_PRICE_DRIFT_RATE, TURNS_PER_YEAR),
      1
    );
  });

  it("tariff charts match the curves, and the engine delegates to them", () => {
    const m = spec("tariff-margin-effects");
    expect(yAt(m, 0, 40)).toBe(foreignMarginModifierForRate(40));
    expect(yAt(m, 1, 100)).toBe(domesticMalusForRate(100));
    const b = spec("tariff-blend-and-capture");
    expect(yAt(b, 1, 100)).toBeCloseTo(blendWeightsForRate(100).nationalWeight * 100, 6);
    expect(getForeignTariffMarginModifier([], "US", "retail", "UK", undefined)).toBe(0);
  });

  it("embargo chart uses the export loss share", () => {
    const s = spec("embargo-revenue-kept");
    expect(yAt(s, 0, 100)).toBeCloseTo(100 * (1 - TRADE_EMBARGO_EXPORT_LOSS_SHARE), 6);
  });

  it("marketization chart marks the real band ceilings and starts RU at its schedule", () => {
    const s = spec("marketization-schedule-by-country");
    expect(s.markers!.map((m) => m.y)).toEqual([COMMAND_CEILING, DUAL_TRACK_CEILING]);
    expect(s.series[0].points[0][1]).toBe(MARKETIZATION_SCHEDULE.RU![0].level);
  });
});
