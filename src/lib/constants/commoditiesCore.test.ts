import { describe, expect, it } from "vitest";
import * as full from "./commodities";
import * as slim from "./commoditiesCore";

describe("commoditiesCore", () => {
  it("re-exports the exact tables commodities.ts serves, so server imports cannot drift", () => {
    expect(full.COMMODITY_TYPES).toBe(slim.COMMODITY_TYPES);
    expect(full.EXTRACTABLE_RESOURCES).toBe(slim.EXTRACTABLE_RESOURCES);
    expect(full.COMMODITY_LABELS).toBe(slim.COMMODITY_LABELS);
  });

  it("labels every commodity and keeps the extractable set inside the catalogue", () => {
    expect(Object.keys(slim.COMMODITY_LABELS).sort()).toEqual([...slim.COMMODITY_TYPES].sort());
    for (const resource of slim.EXTRACTABLE_RESOURCES) {
      expect(slim.COMMODITY_TYPES).toContain(resource);
    }
  });
});
