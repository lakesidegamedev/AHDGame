import { describe, expect, it } from "vitest";
import type { StateMetricValue } from "@/lib/db/types/stateMetrics";
import { brStateMetrics } from "@/lib/seeds/br/brStateMetrics";
import { toStateMetricBaseline } from "./stateMetricBaseline";

describe("toStateMetricBaseline", () => {
  it("keeps the state ID and the ten ordered categories without copying metadata", () => {
    const metrics = structuredClone(brStateMetrics[0]);
    metrics.countryId = "BR";
    const result = toStateMetricBaseline(metrics);
    expect(Object.keys(result)).toEqual(["_id", "baselines"]);
    expect(result._id).toBe(metrics._id);
    expect(Object.keys(result.baselines)).toEqual([
      "economic",
      "education",
      "healthcare",
      "infrastructure",
      "publicSafety",
      "environment",
      "social",
      "governance",
      "population",
      "mediaInformation",
    ]);
    expect(result.baselines.economic.unemploymentRate).toBe(
      metrics.economic.unemploymentRate.value
    );
    expect(result.baselines.mediaInformation).toHaveProperty(
      "pressFreedom",
      metrics.mediaInformation.pressFreedom.value
    );
  });

  it("copies raw values, including zero and nonfinite values, and skips only absent entries", () => {
    const metrics = structuredClone(brStateMetrics[0]);
    const economic = metrics.economic as Record<string, StateMetricValue | undefined>;
    Object.assign(economic, {
      zero: { value: 0 },
      negative: { value: -4 },
      nan: { value: NaN },
      infinite: { value: Infinity },
      missing: undefined,
      withTrend: { value: 12, trend: 99, sectorBaseline: 42 },
    });
    const result = toStateMetricBaseline(metrics).baselines.economic;
    expect(result).toMatchObject({
      zero: 0,
      negative: -4,
      nan: NaN,
      infinite: Infinity,
      withTrend: 12,
    });
    expect(result).not.toHaveProperty("missing");
    expect(result).not.toHaveProperty("trend");
  });

  it("creates independent baseline objects and leaves the seed metrics unchanged", () => {
    const metrics = structuredClone(brStateMetrics[0]);
    const before = structuredClone(metrics);
    const first = toStateMetricBaseline(metrics);
    const second = toStateMetricBaseline(metrics);
    first.baselines.economic.unemploymentRate = 999;
    expect(second.baselines.economic.unemploymentRate).toBe(before.economic.unemploymentRate.value);
    expect(metrics).toEqual(before);
  });

  it("retains empty categories and rejects a missing category instead of hiding malformed seeds", () => {
    const metrics = structuredClone(brStateMetrics[0]);
    for (const key of Object.keys(metrics.economic)) Reflect.deleteProperty(metrics.economic, key);
    expect(toStateMetricBaseline(metrics).baselines.economic).toEqual({});
    Reflect.deleteProperty(metrics, "economic");
    expect(() => toStateMetricBaseline(metrics)).toThrow(TypeError);
  });
});
