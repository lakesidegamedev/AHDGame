import { describe, expect, it } from "vitest";
import { getWealthBonus } from "@/lib/constants/characterWealth";
import { currentWealthTier, wealthTierOptions, wealthTierRepickDelta } from "./wealthTierRepick";

const PRESET = "1991-default";

describe("wealthTierRepickDelta", () => {
  it("moves cash by the difference between the two tiers", () => {
    const delta = wealthTierRepickDelta({
      countryId: "US",
      currentTier: "low",
      nextTier: "high",
      preset: PRESET,
      rates: { USD: 1 },
    });
    expect(delta.currency).toBe("USD");
    expect(delta.anchorDelta).toBe(getWealthBonus("high", PRESET) - getWealthBonus("low", PRESET));
    expect(delta.personalLocalDelta).toBe(delta.anchorDelta);
  });

  it("is zero when the player keeps their tier", () => {
    const delta = wealthTierRepickDelta({
      countryId: "US",
      currentTier: "middle",
      nextTier: "middle",
      preset: PRESET,
      rates: { USD: 1 },
    });
    expect(delta.anchorDelta).toBe(0);
    expect(delta.personalLocalDelta).toBe(0);
  });

  it("converts the change into the home currency at the campaign base rate", () => {
    const delta = wealthTierRepickDelta({
      countryId: "US",
      currentTier: "high",
      nextTier: "low",
      preset: PRESET,
      rates: { USD: 2 },
    });
    expect(delta.anchorDelta).toBeLessThan(0);
    expect(delta.personalLocalDelta).toBe(Math.round(delta.anchorDelta * 2));
  });
});

describe("currentWealthTier", () => {
  it("prefers the creation tier, then demographics, then middle", () => {
    expect(currentWealthTier({ initialIncomeTier: "high", demographics: { wealth: "low" } })).toBe(
      "high"
    );
    expect(currentWealthTier({ demographics: { wealth: "low" } })).toBe("low");
    expect(currentWealthTier({})).toBe("middle");
  });
});

describe("wealthTierOptions", () => {
  it("prices every tier in the era's money", () => {
    const options = wealthTierOptions("US", PRESET, { USD: 1 });
    expect(options.map((o) => o.value)).toEqual(["low", "middle", "high"]);
    expect(options[2].amount).toBe(getWealthBonus("high", PRESET));
  });
});
