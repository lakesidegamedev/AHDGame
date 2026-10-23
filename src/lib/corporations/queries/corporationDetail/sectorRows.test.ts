import { describe, expect, it } from "vitest";
import { ceoSectorLevers, mediaAdvertisingOutputForSector } from "./sectorRows";
import type { FlowSector } from "@/lib/corporations/corpCommodityFlows";

const mediaSector = (over: Partial<FlowSector> = {}): FlowSector => ({
  sectorType: "media",
  stateId: "CA",
  countryId: "US",
  revenue: 1_000,
  revenueAnchor: 1_000,
  strategyId: "standard",
  transitionFromStrategyId: null,
  transitionStartTurn: null,
  industryModel: null,
  mediaDiscriminator: null,
  producedUnits: 1_000,
  capacityUnits: 1_000,
  ...over,
});

describe("ceoSectorLevers", () => {
  it("gives the CEO the product quote policies and wage level", () => {
    expect(
      ceoSectorLevers(
        { producerQuotes: { energy: { kind: "costPlus", markup: -0.1 } }, wageLevel: 1.2 },
        true
      )
    ).toEqual({
      producerQuotes: { energy: { kind: "costPlus", markup: -0.1 } },
      wageLevel: 1.2,
    });
  });

  it("fills the defaults the engine applies when a lever was never set", () => {
    expect(ceoSectorLevers({}, true)).toEqual({ producerQuotes: {}, wageLevel: 1 });
  });

  it("adds nothing for any other viewer", () => {
    const levers = ceoSectorLevers(
      { producerQuotes: { energy: { kind: "manual", unitPrice: 2 } }, wageLevel: 0.8 },
      false
    );
    expect(levers).toEqual({});
    expect("producerQuotes" in levers).toBe(false);
    expect("wageLevel" in levers).toBe(false);
  });
});

describe("mediaAdvertisingOutputForSector", () => {
  it("uses the market factor and exact commodity-ledger output", () => {
    expect(
      mediaAdvertisingOutputForSector(mediaSector(), 10, {
        plantsEnabled: true,
        currentYear: 1953,
        commandEconomyEnabled: true,
      })
    ).toEqual({ units: 100, factor: 0.1 });
  });

  it("uses the planned factor and ledger output for a planned country", () => {
    expect(
      mediaAdvertisingOutputForSector(mediaSector({ countryId: "RU" }), 10, {
        plantsEnabled: true,
        currentYear: 1953,
        commandEconomyEnabled: true,
      })
    ).toEqual({ units: 250, factor: 0.25 });
  });

  it("keeps a news-media zero visible and excludes entertainment media", () => {
    expect(
      mediaAdvertisingOutputForSector(mediaSector({ producedUnits: 0 }), 10, {
        plantsEnabled: true,
        currentYear: 1953,
        commandEconomyEnabled: true,
      })
    ).toEqual({ units: 0, factor: 0.1 });
    expect(
      mediaAdvertisingOutputForSector(mediaSector({ mediaDiscriminator: "entertainment" }), 10, {
        plantsEnabled: true,
      })
    ).toBeNull();
  });
});
