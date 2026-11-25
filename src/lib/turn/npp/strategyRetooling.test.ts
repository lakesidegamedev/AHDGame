import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import { sectorNodeId } from "@/lib/constants/techTree/nodes";
import { chooseNppStrategyRetool } from "./strategyRetooling";

function sector(overrides: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId("000000000000000000000101"),
    corporationId: new ObjectId("000000000000000000000100"),
    countryId: "US",
    stateId: "NY",
    sectorType: "media",
    strategyId: "standard",
    effectiveProfitMargin: -10,
    capitalStock: 1_000,
    otherOpexPerUnitAnchor: 8,
    ...overrides,
  } as CorporateSector;
}

function decide(
  item: CorporateSector,
  prices: Record<string, number> = {},
  overrides: Partial<Parameters<typeof chooseNppStrategyRetool>[0]> = {}
) {
  return chooseNppStrategyRetool({
    corp: makeCorporation({
      _id: item.corporationId,
      type: item.sectorType,
      countryId: "US",
      ceoType: "npp",
    }),
    sectors: [item],
    divestedSectorIds: [],
    turn: 100,
    now: new Date("1994-01-01T00:00:00Z"),
    currentYear: 1994,
    techTreesEnabled: true,
    plantsEnabled: true,
    priceRatioOf: (commodity) => prices[commodity] ?? 1,
    ...overrides,
  });
}

describe("NPP strategy choice on media plants", () => {
  it("keeps legacy broadcast available to a commercial media plant", () => {
    const decision = decide(sector(), { advertising: 4 });
    expect(decision?.updates.strategyId).toBe("legacy_broadcast");
  });

  it("leaves an existing retool and its paid basis alone", () => {
    const item = sector({ transitionFromStrategyId: "streaming_media", transitionStartTurn: 95 });
    const before = structuredClone(item);
    expect(decide(item, { advertising: 4 })).toBeNull();
    expect(item).toEqual(before);
  });
});

describe("NPP strategy choice respects a parent-directed strategy", () => {
  const parentDirected = (untilTurn: number) =>
    sector({
      sectorType: "manufacturing",
      strategyId: "heavy_metals",
      parentDirectedStrategy: {
        byCorporationId: new ObjectId("000000000000000000000200"),
        byUserId: new ObjectId("000000000000000000000201"),
        strategyId: "heavy_metals",
        atTurn: untilTurn - 48,
        untilTurn,
      },
    });

  it("leaves the parent's choice alone inside the protection window", () => {
    // Turn 100 is past the sector cooldown but inside the parent window.
    expect(decide(parentDirected(101))).toBeNull();
  });

  it("resumes normal management once the window ends", () => {
    expect(decide(parentDirected(100), { building_materials: 2 })?.updates).toMatchObject({
      strategyId: "building_materials",
      transitionFromStrategyId: "heavy_metals",
    });
  });
});

describe("NPP sites on a retired (sunset) method convert to a successor", () => {
  const energy = (overrides: Partial<CorporateSector> = {}) =>
    sector({
      sectorType: "energy",
      strategyId: "standard",
      effectiveProfitMargin: 10,
      ...overrides,
    });

  it("converts a profitable conventional plant once the 2039 sunset arrives", () => {
    const decision = decide(energy(), {}, { currentYear: 2040 });
    // Advanced fission needs the corporation's own 2039 node; renewables is
    // inherited from a past decade, so it is the open successor.
    expect(decision?.updates).toMatchObject({
      strategyId: "wind",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 100,
    });
  });

  it("leaves the same plant alone before the sunset", () => {
    expect(decide(energy(), {}, { currentYear: 2038 })).toBeNull();
  });

  it("leaves it alone with tech trees off, where nothing retires", () => {
    expect(decide(energy(), {}, { currentYear: 2040, techTreesEnabled: false })).toBeNull();
  });
});

describe("NPP retooling onto a 2049 breakthrough method", () => {
  // Corporation with the 2049 energy node that unlocks commercial fusion.
  const fusionCorp = (item: CorporateSector) =>
    makeCorporation({
      _id: item.corporationId,
      type: "energy",
      countryId: "US",
      ceoType: "npp",
      unlockedTechNodeIds: [sectorNodeId("energy", "2049", 1)],
    });
  const plant = sector({
    sectorType: "energy",
    strategyId: "wind",
    effectiveProfitMargin: -10,
  });
  const base = {
    corp: fusionCorp(plant),
    currentYear: 2050,
  };

  it("adopts fusion once the lane's world research reaches the threshold", () => {
    const decision = decide(
      plant,
      { energy: 3 },
      { ...base, sectorResearchByLane: new Map([["energy", 1e9]]) }
    );
    expect(decision?.updates).toMatchObject({ strategyId: "fusion_commercial" });
  });

  it("keeps fusion closed below the threshold or without the total", () => {
    const below = decide(
      plant,
      { energy: 3 },
      { ...base, sectorResearchByLane: new Map([["energy", 1]]) }
    );
    expect(below?.updates.strategyId).not.toBe("fusion_commercial");
    const unknown = decide(plant, { energy: 3 }, base);
    expect(unknown?.updates.strategyId).not.toBe("fusion_commercial");
  });

  it("reads the plant's own lane, not another lane's research", () => {
    const decision = decide(
      plant,
      { energy: 3 },
      { ...base, sectorResearchByLane: new Map([["software", 1e9]]) }
    );
    expect(decision?.updates.strategyId).not.toBe("fusion_commercial");
  });
});

describe("NPP retooling under technology diffusion", () => {
  const plant = sector({
    sectorType: "energy",
    strategyId: "wind",
    effectiveProfitMargin: -10,
  });
  const corp = makeCorporation({
    _id: plant.corporationId,
    type: "energy",
    countryId: "US",
    ceoType: "npp",
    unlockedTechNodeIds: [sectorNodeId("energy", "2049", 1)],
  });
  const diffusion = (operators: string[] = []) => ({
    readinessByCountry: new Map([["US", 0.8]]),
    operatorCountriesByStrategy: new Map([["fusion_commercial", new Set(operators)]]),
  });
  const base = { corp, sectorResearchByLane: new Map([["energy", 1e9]]) };

  it("waits for the country lag before adopting a new tier's method", () => {
    const early = decide(
      plant,
      { energy: 3 },
      { ...base, currentYear: 2050, techDiffusion: diffusion() }
    );
    expect(early?.updates.strategyId).not.toBe("fusion_commercial");
    const onTime = decide(
      plant,
      { energy: 3 },
      { ...base, currentYear: 2052, techDiffusion: diffusion() }
    );
    expect(onTime?.updates).toMatchObject({ strategyId: "fusion_commercial" });
  });

  it("can retool a player company to a researched method before local diffusion", () => {
    const decision = decide(
      plant,
      { energy: 3 },
      {
        ...base,
        corp: { ...corp, ceoType: "character" },
        currentYear: 2050,
        techDiffusion: diffusion(),
      }
    );
    expect(decision?.updates).toMatchObject({ strategyId: "fusion_commercial" });
  });

  it("does not license early from a foreign operator", () => {
    const decision = decide(
      plant,
      { energy: 3 },
      { ...base, currentYear: 2050, techDiffusion: diffusion(["DE"]) }
    );
    expect(decision?.updates.strategyId).not.toBe("fusion_commercial");
  });
});
