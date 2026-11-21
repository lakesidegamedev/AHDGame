import { describe, expect, it } from "vitest";
import { buildDemandCapGaps } from "./buildDemandCap";
import type { CommodityType } from "@/lib/constants/commodities";

const electronics = (supply: number, demand: number) =>
  new Map<CommodityType, { supply: number; demand: number }>([["electronics", { supply, demand }]]);

describe("cap-hidden build demand", () => {
  it("finds the part of capped demand that existing supply cannot cover", () => {
    const gaps = buildDemandCapGaps({
      global: electronics(130, 100),
      states: new Map([
        ["GA", electronics(36, 30)],
        ["CT", electronics(11, 10)],
        ["DE", electronics(20, 10)],
      ]),
      countries: new Map([
        ["US", electronics(80, 60)],
        ["CA", electronics(50, 40)],
      ]),
      removed: new Map([["electronics", 50]]),
    });
    expect(gaps.get("electronics")).toEqual({
      byState: { GA: 9, CT: 4 },
      byCountry: { US: 10, CA: 10 },
    });
  });

  it("keeps funded estimates absent when no cap removed demand", () => {
    expect(
      buildDemandCapGaps({
        global: electronics(20, 100),
        states: new Map([["GA", electronics(20, 100)]]),
        countries: new Map([["US", electronics(20, 100)]]),
        removed: new Map(),
      }).size
    ).toBe(0);
  });
});
