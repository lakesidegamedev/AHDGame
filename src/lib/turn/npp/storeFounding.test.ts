import { describe, expect, it } from "vitest";
import { candidate, candidatesByCountry } from "./__fixtures__/marketCandidates";
import { findBestMarketCandidate, type PlacementSignals } from "./marketSignals";
import { storeUnmetRunUnits } from "@/lib/stores/rules/storeRules";

const coverage = {
  NY: { capacityValue: 1000, runUnits: 10, routedDemandValue: 3000 },
  OH: { capacityValue: 1000, runUnits: 10, routedDemandValue: 900 },
};

/** Same wiring the NPP turn uses for a store cell: the gap is unserved household store demand. */
const signals: PlacementSignals = {
  unmetDemandUnitsOf: (cell) =>
    cell.sectorType === "retail" ? storeUnmetRunUnits(coverage, cell.stateId) : null,
};

describe("NPP stores follow unserved household store demand", () => {
  it("founds a store where stores cannot serve the household demand, not where they already do", () => {
    const pool = [
      candidate({ stateId: "NY", sectorType: "retail" }),
      candidate({ stateId: "OH", sectorType: "retail" }),
    ];
    const best = findBestMarketCandidate(
      "US" as never,
      "OH",
      "retail",
      null,
      new Set(),
      candidatesByCountry(pool),
      new Set(),
      () => 1,
      true,
      1,
      signals
    );
    expect(best?.stateId).toBe("NY");
    expect(best?.sectorType).toBe("retail");
  });

  it("finds no room for a store in a state its stores already serve", () => {
    const pool = [candidate({ stateId: "OH", sectorType: "retail" })];
    const best = findBestMarketCandidate(
      "US" as never,
      "OH",
      "retail",
      null,
      new Set(),
      candidatesByCountry(pool),
      new Set(),
      () => 1,
      true,
      1,
      signals
    );
    expect(best).toBeNull();
  });
});
