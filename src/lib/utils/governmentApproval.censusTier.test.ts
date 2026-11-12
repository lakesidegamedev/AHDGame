import { describe, it, expect, vi } from "vitest";
import type { Db } from "mongodb";

vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: vi.fn().mockResolvedValue({ fullSimulationIds: ["US", "UK"] }),
}));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStateCollection: vi.fn().mockResolvedValue({
    findOne: vi.fn().mockResolvedValue({ preset: "2019" }),
  }),
}));
vi.mock("@/lib/demographics/electorateWeights", () => ({
  electorateUnitsByRegion: vi.fn(() => new Map([["UK:ENG", [{ population: 1 }]]])),
}));

import { loadElectorateGroups, weightingFor } from "@/lib/utils/governmentApproval";

const emptyCursorDb = {
  collection: () => ({ find: () => ({ toArray: async () => [] }) }),
} as unknown as Db;

describe("weightingFor census fallback by country tier", () => {
  it("returns the census groups when the region has them", async () => {
    const groups = await loadElectorateGroups(emptyCursorDb);
    expect(weightingFor(groups, "UK", "ENG")).toEqual({ groups: [{ population: 1 }] });
  });

  it("throws for a playable or NPP-run country with no census", async () => {
    const groups = await loadElectorateGroups(emptyCursorDb);
    expect(() => weightingFor(groups, "UK", "WLS")).toThrow(/no census electorate for UK:WLS/);
    expect(() => weightingFor(groups, "US", "TX")).toThrow(/US:TX/);
  });

  it("falls back to unweighted for a background country", async () => {
    const groups = await loadElectorateGroups(emptyCursorDb);
    expect(weightingFor(groups, "IE", "DUB")).toBeUndefined();
  });

  it("stays lenient for a map not built by the loader", () => {
    expect(weightingFor(new Map(), "UK", "WLS")).toBeUndefined();
  });
});
