import { describe, expect, it } from "vitest";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import { EMERGENT_CRISIS_DEFINITIONS } from "./definitions/emergent";
import { LEGACY_SPILLOVER } from "./legacySpillover";
import { gdpShareWeights } from "./spillover";

describe("spillover content", () => {
  it("links authored crises only between templates that exist", () => {
    for (const [key, links] of Object.entries(LEGACY_SPILLOVER)) {
      expect(ALL_CRISIS_TEMPLATES[key], key).toBeDefined();
      for (const link of links) expect(ALL_CRISIS_TEMPLATES[link.targetKey], link.id).toBeDefined();
    }
  });

  it("gives every emergent definition a link that resolves to a known definition", () => {
    const ids = new Set(EMERGENT_CRISIS_DEFINITIONS.map((def) => def.id));
    for (const def of EMERGENT_CRISIS_DEFINITIONS) {
      expect(def.spillover.length, def.id).toBeGreaterThan(0);
      expect(new Set(def.spillover.map((link) => link.id)).size).toBe(def.spillover.length);
      for (const link of def.spillover)
        expect(ids.has(link.targetDefinitionId), link.id).toBe(true);
    }
  });
});

describe("gdpShareWeights", () => {
  it("sizes foreign debt against the holder's economy and caps at full weight", () => {
    const exposure = new Map([
      [
        "UK",
        new Map([
          ["US", 50],
          ["DE", 5],
        ]),
      ],
      ["DE", new Map([["US", 1]])],
    ]);
    const gdp = new Map([
      ["UK", 1000],
      ["DE", 1000],
    ]);
    const weights = gdpShareWeights(exposure, gdp, 0.05);
    expect(weights.get("US")?.get("UK")).toBe(1);
    expect(weights.get("DE")?.get("UK")).toBeCloseTo(0.1);
    expect(weights.get("US")?.get("DE")).toBeCloseTo(0.02);
  });

  it("skips holders with no GDP and a holder's own debt", () => {
    const exposure = new Map([
      [
        "UK",
        new Map([
          ["UK", 10],
          ["US", 10],
        ]),
      ],
      ["FR", new Map([["US", 10]])],
    ]);
    const weights = gdpShareWeights(exposure, new Map([["UK", 100]]), 0.1);
    expect(weights.get("UK")).toBeUndefined();
    expect([...(weights.get("US")?.keys() ?? [])]).toEqual(["UK"]);
  });
});
