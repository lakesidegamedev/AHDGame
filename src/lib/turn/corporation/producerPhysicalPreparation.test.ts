import { getSectorLaborShare } from "@/lib/labour/laborCost";
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import {
  prepareProducerPhysicalSector,
  withStateBooks,
  type ProducerPhysicalEnv,
} from "./producerPhysicalPreparation";

function fixture() {
  const corporation = makeCorporation({ countryId: "US", liquidCurrencyCode: "USD" });
  const sector: CorporateSector = {
    _id: new ObjectId(),
    corporationId: corporation._id,
    countryId: "US",
    stateId: "CA",
    sectorType: "financial",
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    revenue: 999999,
    profitMargin: 99,
    workers: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    capitalStock: 240,
    capacityBookAnchor: 100,
    buildQueue: [],
    producerCapacity: { worldEpoch: "world", turn: 0 },
    producerInventory: { worldEpoch: "world", turn: 0, inputStock: [], outputStock: [] },
  };
  const env: ProducerPhysicalEnv = {
    currentTurn: 1,
    currentYear: 1991,
    techTreesEnabled: false,
    labour: { wagesEnabled: true, unionsEnabled: false, fullEnabled: false },
    wageIndexByState: new Map(),
    automationIndexByState: new Map(),
    pendingStrikeEvents: [],
    labourDemandByState: new Map(),
    lookups: {
      preset: "1991-default",
      eraUnitScale: 1,
      labourTightnessByState: new Map(),
      stateResourceCapacityByState: new Map(),
      priceRatioByCommodity: new Map(),
      activeDisasterEffectsByState: new Map(),
      rawWorkforceSkillByState: new Map(),
      extractionCapacityUtilBySector: new Map(),
    },
  };
  const input = { worldEpoch: "world", env, corporation, sector, inputPriceHeadroom: 1.25 };
  return { input, env, sector };
}

describe("physical producer preparation", () => {
  it("retains sale-only quotes for stored goods outside the current production recipe", () => {
    const { input, sector } = fixture();
    sector.producerInventory!.outputStock = [
      { commodity: "steel", book: "world", units: 5, quoteUnitCost: 2 },
    ];
    sector.producerQuotes = { steel: { kind: "costPlus", markup: 0.5 } };
    const prepared = prepareProducerPhysicalSector(input).prepared.plan;
    expect(prepared.outputs.find((output) => output.commodity === "steel")).toMatchObject({
      unitsPerOutput: 0,
      retainedUnitCost: 2,
      policy: { kind: "costPlus", markup: 0.5 },
    });
    expect(prepared.outputStock).toEqual(sector.producerInventory!.outputStock);
    expect(
      prepared.outputs.some(
        (output) => output.commodity === "financial_services" && output.unitsPerOutput > 0
      )
    ).toBe(true);
  });

  it("does not relocate retained goods into another market book", () => {
    const { input, sector } = fixture();
    sector.producerInventory!.outputStock = [
      { commodity: "steel", book: "different-book", units: 5 },
    ];
    expect(() => prepareProducerPhysicalSector(input)).toThrow("market-scope reconciliation");
  });

  it("keeps staff and capacity independent of quotes, recorded revenue and last turn's fill", () => {
    const { input, sector } = fixture();
    const first = prepareProducerPhysicalSector(input);
    sector.revenue = 0;
    sector.profitMargin = -100;
    sector.soldUnits = 0;
    sector.producerQuotes = { financial_services: { kind: "manual", unitPrice: 9999 } };
    const second = prepareProducerPhysicalSector(input);
    expect(second.prepared.plan.capacityUnits).toBe(first.prepared.plan.capacityUnits);
    expect(second.prepared.plan.outputMultiplier).toBe(first.prepared.plan.outputMultiplier);
    expect(second.prepared.plan.labourCost).toBe(first.prepared.plan.labourCost);
    expect(second.prepared.plan.otherOperatingCost).toBe(first.prepared.plan.otherOperatingCost);
    expect(second.headcount).toEqual(first.headcount);
    expect(
      second.prepared.plan.outputs.find((output) => output.commodity === "financial_services")
        ?.policy
    ).toEqual({ kind: "manual", unitPrice: 9999 });
  });

  it("prices work on the base value of actual owned output, independently of market quotes", () => {
    const { input, env } = fixture();
    const {
      prepared: { plan },
    } = prepareProducerPhysicalSector(input);
    const outputValue =
      plan.capacityUnits *
      plan.outputs.reduce(
        (sum, output) => sum + output.unitsPerOutput * output.referenceUnitPrice,
        0
      );
    expect(plan.labourCost).toBeCloseTo(outputValue * getSectorLaborShare("financial", 1991), 8);
    expect(plan.otherOperatingCost).toBeCloseTo(outputValue * 0.04, 8);
    env.lookups.priceRatioByCommodity.set("financial_services", 2);
    const changed = prepareProducerPhysicalSector(input).prepared.plan;
    expect(changed.capacityUnits).toBe(plan.capacityUnits);
    expect(changed.labourCost).toBe(plan.labourCost);
    expect(changed.otherOperatingCost).toBe(plan.otherOperatingCost);
    expect(changed.outputs[0].referenceUnitPrice).toBe(plan.outputs[0].referenceUnitPrice * 2);
  });

  it("makes an off-type plant less productive instead of charging margin", () => {
    const { input } = fixture();
    input.corporation.type = "financial";
    const own = prepareProducerPhysicalSector(input).prepared.plan;
    input.corporation.type = "media";
    const off = prepareProducerPhysicalSector(input).prepared.plan;
    expect(off.outputMultiplier / own.outputMultiplier).toBeCloseTo(0.85 / 1.05, 10);
    expect(off.labourCost).toBe(own.labourCost);
    expect(off.otherOperatingCost).toBe(own.otherOperatingCost);
  });

  it("runs more after a profitable sell-out and less after selling below input cost", () => {
    const { input, sector } = fixture();
    const base = { activeUnits: 100, producedUnits: 50, offeredUnits: 50, inputsConsumed: 200 };
    const turn = input.env.currentTurn - 1;
    (sector as unknown as { producerSettlement: unknown }).producerSettlement = {
      ...base,
      soldUnits: 50,
      revenue: 500,
      turn,
    };
    const good = prepareProducerPhysicalSector(input).prepared.plan.outputMultiplier;
    (sector as unknown as { producerSettlement: unknown }).producerSettlement = {
      ...base,
      soldUnits: 50,
      revenue: 100,
      turn,
    };
    const bad = prepareProducerPhysicalSector(input).prepared.plan.outputMultiplier;
    expect(good / bad).toBeCloseTo((0.5 * 1.15) / (0.5 * 0.9), 10);
  });

  it("low-use cost stage zeroes the bill on a parked plant and cuts the probe run of a dead one", () => {
    const { input, env, sector } = fixture();
    (sector as unknown as { mothballed: boolean }).mothballed = true;
    const off = prepareProducerPhysicalSector(input).prepared.plan.otherOperatingCost;
    env.lowUseCostStage = 1;
    const on = prepareProducerPhysicalSector(input).prepared.plan.otherOperatingCost;
    expect(off).toBeGreaterThan(0);
    expect(on).toBe(0);
    (sector as unknown as { mothballed: boolean }).mothballed = false;
    (sector as unknown as { producerSettlement: unknown }).producerSettlement = {
      activeUnits: 100,
      producedUnits: 10,
      offeredUnits: 10,
      soldUnits: 0,
      revenue: 0,
      inputsConsumed: 0,
      turn: env.currentTurn - 1,
    };
    env.lowUseCostStage = 0;
    const slow = prepareProducerPhysicalSector(input).prepared.plan.outputMultiplier;
    env.lowUseCostStage = 1;
    const fast = prepareProducerPhysicalSector(input).prepared.plan.outputMultiplier;
    expect(fast / slow).toBeCloseTo(0.1, 8);
  });

  it("retires capacity that persistently sells nothing only after the transition window", () => {
    const { input, env, sector } = fixture();
    const turn = env.currentTurn - 1;
    (sector as unknown as { producerSettlement: unknown }).producerSettlement = {
      activeUnits: 100,
      producedUnits: 10,
      offeredUnits: 10,
      soldUnits: 0,
      revenue: 0,
      inputsConsumed: 0,
      turn,
    };
    (sector as unknown as { producerZeroSalesTurns: number }).producerZeroSalesTurns = 20;
    const off = prepareProducerPhysicalSector(input).prepared.plan.capacityUnits;
    env.idleRetireStage = 1;
    env.transitionFirstFundedTurn = env.currentTurn - 1;
    expect(prepareProducerPhysicalSector(input).prepared.plan.capacityUnits).toBe(off);
    env.transitionFirstFundedTurn = env.currentTurn - 1000;
    expect(prepareProducerPhysicalSector(input).prepared.plan.capacityUnits).toBeLessThan(off);
    (sector as unknown as { mothballed: boolean }).mothballed = true;
    expect(prepareProducerPhysicalSector(input).prepared.plan.capacityUnits).toBeCloseTo(off, 10);
  });

  it("pays wages and site running costs for the line it runs, not idle capacity", () => {
    const { input, sector } = fixture();
    const full = prepareProducerPhysicalSector(input);
    // A glut last turn drops the run to the probe floor.
    (sector as unknown as { producerSettlement: unknown }).producerSettlement = {
      activeUnits: 100,
      producedUnits: 50,
      offeredUnits: 50,
      soldUnits: 0,
      revenue: 0,
      inputsConsumed: 200,
      turn: input.env.currentTurn - 1,
    };
    const idle = prepareProducerPhysicalSector(input);
    expect(idle.prepared.plan.labourCost).toBeCloseTo(full.prepared.plan.labourCost * 0.1, 6);
    expect(idle.headcount.workers).toBeLessThan(full.headcount.workers);
    expect(idle.prepared.plan.otherOperatingCost).toBeLessThan(
      full.prepared.plan.otherOperatingCost * 0.2
    );
    expect(idle.prepared.plan.otherOperatingCost).toBeGreaterThan(
      full.prepared.plan.otherOperatingCost * 0.1
    );
  });

  it("retains a smaller cold-site bill while mothballing stops jobs and output", () => {
    const { input, sector } = fixture();
    const running = prepareProducerPhysicalSector(input);
    sector.mothballed = true;
    const parked = prepareProducerPhysicalSector(input);
    expect(parked.prepared.plan.activeFraction).toBe(0);
    expect(parked.prepared.plan.labourCost).toBe(0);
    expect(parked.prepared.plan.otherOperatingCost).toBeGreaterThan(0);
    expect(parked.prepared.plan.otherOperatingCost).toBeLessThan(
      running.prepared.plan.otherOperatingCost
    );
    expect(parked.prepared.target.capacity).toEqual(running.prepared.target.capacity);
  });

  it("charges only the staffed workforce when a state cannot fill all jobs", () => {
    const { input, env, sector } = fixture();
    const full = prepareProducerPhysicalSector(input);
    env.lookups.labourTightnessByState.set(sector.stateId, 2);
    sector.labourStaffingFactor = 0.5;
    const short = prepareProducerPhysicalSector(input);
    expect(short.staffingFactor).toBeCloseTo(0.5);
    expect(short.headcount.workers).toBeCloseTo(full.headcount.workers / 2);
    expect(short.prepared.plan.labourCost).toBeCloseTo(full.prepared.plan.labourCost / 2);
  });

  it("separates a physical halt from the bills an active workforce still incurs", () => {
    const { input, env, sector } = fixture();
    const running = prepareProducerPhysicalSector(input);
    env.lookups.activeDisasterEffectsByState.set(sector.stateId, [
      {
        value: -100,
        startTurn: 1,
        durationTurns: 10,
        sectorType: null,
        strategyId: null,
        physicality: "physical",
      },
    ]);
    const halted = prepareProducerPhysicalSector(input);
    expect(halted.prepared.plan.outputMultiplier).toBe(0);
    expect(halted.prepared.plan.labourCost).toBe(running.prepared.plan.labourCost);
    expect(halted.prepared.plan.otherOperatingCost).toBe(running.prepared.plan.otherOperatingCost);
  });

  it("requires actual resource and unit-basis reconciliation instead of granting output", () => {
    const { input, sector, env } = fixture();
    sector.sectorType = "extraction";
    expect(() => prepareProducerPhysicalSector(input)).toThrow("resource opening");
    env.lookups.stateResourceCapacityByState.set(sector.stateId, {});
    const empty = prepareProducerPhysicalSector(input);
    expect(empty.prepared.plan.outputMultiplier).toBe(0);
    sector.transitionFromStrategyId = "oil_gas";
    expect(() => prepareProducerPhysicalSector(input)).toThrow("owned-unit basis");
  });
});

describe("carried country-book stock", () => {
  it("is read back onto the plant's own state book", () => {
    const sector = {
      stateId: "US_CA",
      producerInventory: {
        worldEpoch: "w",
        turn: 1,
        inputStock: [],
        outputStock: [
          { commodity: "freight", units: 5, book: "country:US" },
          { commodity: "food", units: 1, book: "world" },
        ],
      },
    } as unknown as CorporateSector;
    const out = withStateBooks(sector);
    expect(out.producerInventory!.outputStock.map((r) => r.book)).toEqual(["state:US_CA", "world"]);
    const plain = {
      stateId: "X",
      producerInventory: { worldEpoch: "w", turn: 1, inputStock: [], outputStock: [] },
    } as unknown as CorporateSector;
    expect(withStateBooks(plain)).toBe(plain);
  });
});
