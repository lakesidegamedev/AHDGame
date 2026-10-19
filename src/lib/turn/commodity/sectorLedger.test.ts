import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  COMMODITY_BASE_PRICES,
  SECTOR_SUPPLY,
  commodityMixWeight,
} from "@/lib/constants/commodities";
import { impliedOutputUnits } from "@/lib/market/capital";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { computeRawSupplyDemand } from "@/lib/constants/commodities";
import type { SectorLedgerRow } from "./ledgerTypes";
import type { CorporateSector } from "@/lib/db/types";
import {
  accumulatePlantsUnits,
  buildExtractionRevenueInputs,
  buildSectorRows,
  withRealizedOutputCaps,
} from "./sectorLedger";
import { computeExtractionCapacityMultipliers } from "@/lib/turn/extraction/extractionCapacity";

describe("accumulatePlantsUnits product output", () => {
  it("uses exact per-commodity production and clearing units instead of re-splitting", () => {
    const sector: SectorLedgerRow = {
      sectorType: "manufacturing",
      revenue: 300,
      stateId: "S1",
      sectorId: "sector-1",
      corporationId: new ObjectId(),
      isNatcorp: false,
      strategyId: "standard",
      producedUnits: 10,
      soldUnits: 5,
      outputUnitsByCommodity: { steel: 2, vehicles: 3 },
      soldByCommodity: { steel: 0.75, vehicles: 1 / 3 },
      embargoSupplyFactor: 0.5,
    };

    expect(accumulatePlantsUnits([sector], 20, COMMODITY_BASE_PRICES)).toEqual(
      new Map([
        ["steel", { produced: 1, sold: 0.75 }],
        ["vehicles", { produced: 1.5, sold: 0.5 }],
      ])
    );
  });

  it("dual-reads a persisted operating model in the plants commodity ledger", () => {
    const sector: SectorLedgerRow = {
      sectorType: "media",
      revenue: 500,
      stateId: "S1",
      sectorId: "media-model-1",
      corporationId: new ObjectId(),
      isNatcorp: false,
      strategyId: "cable_tv",
      producedUnits: 10,
      soldUnits: 5,
      embargoSupplyFactor: 1,
    };
    const supply = getEffectiveStrategyRates("media", "cable_tv", null, null, 20).supply;
    const expected = new Map(
      Object.keys(supply).map((commodity) => {
        const weight = commodityMixWeight(
          supply,
          COMMODITY_BASE_PRICES,
          commodity as keyof typeof COMMODITY_BASE_PRICES
        );
        return [commodity, { produced: 10 * weight, sold: 5 * weight }];
      })
    );

    expect(accumulatePlantsUnits([sector], 20, COMMODITY_BASE_PRICES)).toEqual(expected);
    expect(expected.has("advertising")).toBe(true);
    expect(expected.has("entertainment_services")).toBe(true);
  });
});

describe("automobile model dual-read through commodity pricing", () => {
  it("keeps the legacy recipe when a vehicle sector is stored as manufacturing plus model", () => {
    const id = new ObjectId();
    const base = {
      _id: id,
      corporationId: new ObjectId(),
      stateId: "US-MI",
      countryId: "US",
      strategyId: "standard",
      revenue: 250_000,
      createdAt: new Date(),
    };
    const legacy = buildSectorRows({
      allSectors: [{ ...base, sectorType: "manufacturing_vehicles" } as unknown as CorporateSector],
      corporationById: new Map(),
      natcorpIds: new Set(),
      fxByCurrency: new Map(),
      stateToCountry: new Map([["US-MI", "US"]]),
      ledgerCurrentYear: null,
      ledgerCommandEconomyEnabled: false,
      turn: 1,
    });
    const modelled = buildSectorRows({
      allSectors: [
        {
          ...base,
          sectorType: "manufacturing",
          industryModel: "vehicles",
        } as unknown as CorporateSector,
      ],
      corporationById: new Map(),
      natcorpIds: new Set(),
      fxByCurrency: new Map(),
      stateToCountry: new Map([["US-MI", "US"]]),
      ledgerCurrentYear: null,
      ledgerCommandEconomyEnabled: false,
      turn: 1,
    });

    expect(modelled[0]?.industryModel).toBe("vehicles");
    expect(computeRawSupplyDemand(modelled).global).toEqual(computeRawSupplyDemand(legacy).global);
  });
});

describe("entertainment media dual-read through commodity pricing", () => {
  it("keeps the legacy recipe for a canonical media row with the entertainment discriminator", () => {
    const id = new ObjectId();
    const base = {
      _id: id,
      corporationId: new ObjectId(),
      stateId: "US-CA",
      countryId: "US",
      strategyId: "film_studio",
      revenue: 250_000,
      createdAt: new Date(),
    };
    const legacy = buildSectorRows({
      allSectors: [{ ...base, sectorType: "media_entertainment" } as unknown as CorporateSector],
      corporationById: new Map(),
      natcorpIds: new Set(),
      fxByCurrency: new Map(),
      stateToCountry: new Map([["US-CA", "US"]]),
      ledgerCurrentYear: null,
      ledgerCommandEconomyEnabled: false,
      turn: 1,
    });
    const canonical = buildSectorRows({
      allSectors: [
        {
          ...base,
          sectorType: "media",
          mediaDiscriminator: "entertainment",
        } as unknown as CorporateSector,
      ],
      corporationById: new Map(),
      natcorpIds: new Set(),
      fxByCurrency: new Map(),
      stateToCountry: new Map([["US-CA", "US"]]),
      ledgerCurrentYear: null,
      ledgerCommandEconomyEnabled: false,
      turn: 1,
    });

    expect(canonical[0]?.mediaDiscriminator).toBe("entertainment");
    expect(computeRawSupplyDemand(canonical).global).toEqual(computeRawSupplyDemand(legacy).global);
  });

  it("does not apply the news media supply derate to the canonical entertainment lane", () => {
    const base = {
      _id: new ObjectId(),
      corporationId: new ObjectId(),
      stateId: "US-CA",
      countryId: "US",
      strategyId: "film_studio",
      revenue: 250_000,
      producedUnits: 40,
      createdAt: new Date(),
    };
    const rows = (sector: Record<string, unknown>) =>
      buildSectorRows({
        allSectors: [{ ...base, ...sector } as unknown as CorporateSector],
        corporationById: new Map(),
        natcorpIds: new Set(),
        fxByCurrency: new Map(),
        stateToCountry: new Map([["US-CA", "US"]]),
        ledgerCurrentYear: 1991,
        ledgerCommandEconomyEnabled: true,
        turn: 1,
      });

    const legacy = rows({ sectorType: "media_entertainment" });
    const canonical = rows({ sectorType: "media", mediaDiscriminator: "entertainment" });
    const news = rows({ sectorType: "media", mediaDiscriminator: "media", strategyId: "standard" });

    expect(legacy[0]?.embargoSupplyFactor).toBe(1);
    expect(canonical[0]?.embargoSupplyFactor).toBe(1);
    expect(news[0]?.embargoSupplyFactor).toBe(0.1);
    expect(computeRawSupplyDemand(canonical).global).toEqual(computeRawSupplyDemand(legacy).global);
  });
});

describe("extraction deposit rationing on real output (#4503)", () => {
  const corpA = new ObjectId();
  const corpB = new ObjectId();
  const capacity = (iron: number) => [
    {
      _id: new ObjectId(),
      stateId: "MN",
      countryId: "US" as const,
      resources: { iron },
      updatedAt: new Date(),
    },
  ];
  const mine = (
    sectorId: string,
    corporationId: ObjectId,
    revenue: number,
    producedUnits?: number
  ) =>
    ({
      sectorType: "extraction",
      revenue,
      stateId: "MN",
      sectorId,
      corporationId,
      isNatcorp: false,
      strategyId: "standard",
      ...(producedUnits == null ? {} : { producedUnits }),
    }) as SectorLedgerRow;
  // Whole-mix nameplate units, the basis of the realized fraction.
  const totalNameplate = (revenue: number) =>
    impliedOutputUnits(
      revenue,
      Object.fromEntries((SECTOR_SUPPLY.extraction ?? []).map((f) => [f.commodity, f.rate])),
      COMMODITY_BASE_PRICES,
      1
    );
  // What depletion books: nameplate x multiplier x realized fraction.
  const booked = (
    rows: SectorLedgerRow[],
    iron: number,
    plantsEnabled: boolean
  ): { units: Map<string, number>; nameplate: Map<string, number> } => {
    const fractions = new Map<string, number>();
    const inputs = buildExtractionRevenueInputs(rows, 20, COMMODITY_BASE_PRICES, false, fractions);
    const mults = computeExtractionCapacityMultipliers(
      plantsEnabled ? withRealizedOutputCaps(inputs, fractions) : inputs,
      [],
      capacity(iron)
    );
    const units = new Map<string, number>();
    const nameplate = new Map<string, number>();
    for (const input of inputs) {
      const n = input.revenueBasedOutput.iron ?? 0;
      nameplate.set(input.sectorId, n);
      units.set(
        input.sectorId,
        n * (mults.get(input.sectorId)?.iron ?? 1) * (fractions.get(input.sectorId) ?? 1)
      );
    }
    return { units, nameplate };
  };

  it("books real digging in full when it fits the deposit, even if nameplate does not", () => {
    const probe = booked([mine("a", corpA, 1_000_000), mine("b", corpB, 1_000_000)], 1e12, true);
    const nameplate = probe.nameplate.get("a")!;
    expect(nameplate).toBeGreaterThan(0);
    // Each mine's plants dig 20% of nameplate; deposit holds 1.5 nameplates.
    const dig = totalNameplate(1_000_000) * 0.2;
    const rows = [mine("a", corpA, 1_000_000, dig), mine("b", corpB, 1_000_000, dig)];
    const iron = nameplate * 1.5;
    const capped = booked(rows, iron, true);
    expect(capped.units.get("a")).toBeCloseTo(nameplate * 0.2);
    expect(capped.units.get("b")).toBeCloseTo(nameplate * 0.2);
    // Old nameplate rationing cut it a second time.
    const legacy = booked(rows, iron, false);
    expect(legacy.units.get("a")!).toBeLessThan(nameplate * 0.2 * 0.8);
  });

  it("never books more than the deposit when real digging exceeds it", () => {
    const nameplate = booked([mine("a", corpA, 1_000_000)], 1e12, true).nameplate.get("a")!;
    const total = totalNameplate(1_000_000);
    const rows = [
      mine("a", corpA, 1_000_000, total * 0.9),
      mine("b", corpB, 1_000_000, total * 0.3),
    ];
    const iron = nameplate * 0.6;
    const { units } = booked(rows, iron, true);
    expect(units.get("a")! + units.get("b")!).toBeCloseTo(iron);
    expect(units.get("a")! / units.get("b")!).toBeCloseTo(3);
  });

  it("keeps a sector with no production record (newly founded, first plants turn) uncapped", () => {
    const rows = [mine("new", corpA, 1_000_000), mine("zero", corpB, 0, 0)];
    const fractions = new Map<string, number>();
    const inputs = buildExtractionRevenueInputs(rows, 20, COMMODITY_BASE_PRICES, false, fractions);
    expect(withRealizedOutputCaps(inputs, fractions)).toEqual(inputs);
  });
});
