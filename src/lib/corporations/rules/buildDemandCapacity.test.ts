import { describe, expect, it } from "vitest";
import { sizeBuildDemand, fullMixBuildRoom } from "./buildDemandCapacity";
import type { BuildDemandRow } from "./fundedBuildDemand";
import { commodityMixWeight, COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";

describe("shared funded build sizing", () => {
  for (const countryId of ["US", "UK", "JP"]) {
    it(`${countryId}: does not average a network shortage over satisfied software buyers`, () => {
      const supply = { software: 1, network_services: 1 };
      const rows = sizeBuildDemand({
        supply,
        outputMultiplier: 1,
        stateId: "local",
        countryId,
        rows: [
          { commodity: "software", scope: "national", funded: 100, delivered: 100, unmet: 0 },
          {
            commodity: "network_services",
            scope: "national",
            funded: 1000,
            delivered: 0,
            unmet: 1000,
          },
        ],
        producers: [],
      });
      expect(fullMixBuildRoom(rows)).toBe(0);
      expect(rows[1].capacityUnits).toBeGreaterThan(1000);
    });
    it(`${countryId}: subtracts local idle capacity and national queues in their own scopes`, () => {
      const rows: BuildDemandRow[] = ["regional", "national"].map((scope) => ({
        commodity: "network_services",
        scope: scope as "regional" | "national",
        funded: 100,
        delivered: 0,
        unmet: 100,
      }));
      const result = sizeBuildDemand({
        rows,
        supply: { network_services: 1 },
        outputMultiplier: 2,
        stateId: "local",
        countryId,
        producers: [
          {
            stateId: "local",
            countryId,
            supply: { network_services: 1 },
            capacity: 20,
            produced: 10,
            queued: 10,
          },
          {
            stateId: "other",
            countryId,
            supply: { network_services: 1 },
            capacity: 40,
            produced: 40,
            queued: 30,
          },
          {
            stateId: "abroad",
            countryId: "foreign",
            supply: { network_services: 1 },
            capacity: 1000,
            produced: 0,
            queued: 1000,
          },
        ],
      });
      expect(result.map((row) => row.capacityUnits)).toEqual([40, 25]);
      expect(fullMixBuildRoom(result)).toBe(25);
    });
  }
  it("uses the physical output mix, not the recipe coefficient, and keeps missing capacity unknown", () => {
    const supply = { software: 4, network_services: 2 };
    const rows: BuildDemandRow[] = [
      { commodity: "network_services", scope: "national", funded: 100, delivered: 0, unmet: 100 },
    ];
    const args = {
      rows,
      supply,
      outputMultiplier: 1.5,
      stateId: "local",
      countryId: "UK",
      producers: [],
    };
    expect(sizeBuildDemand(args)[0].capacityUnits).toBeCloseTo(
      100 / (1.5 * commodityMixWeight(supply, COMMODITY_BASE_PRICES, "network_services"))
    );
    const unknown = sizeBuildDemand({
      ...args,
      producers: [{ stateId: "local", countryId: "UK", supply, capacity: 100, queued: 0 }],
    });
    expect(fullMixBuildRoom(unknown)).toBeNull();
  });
});
