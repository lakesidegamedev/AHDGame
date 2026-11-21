import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import {
  fillAuthoredEraRates,
  fxRateForSectorHostFromMap,
  resetCorpFxRateCacheForTests,
  resolveSectorHostCurrencyCode,
  withAuthoredEraRates,
} from "@/lib/currency/corporationCapital";
import { sumCorporateSectorAnnualRevenue } from "@/lib/bonds/corporateCredit";
import { estimateNationalizedOperatingIncome } from "@/lib/budget/publicEnterpriseRevenue";
import { loadIndustryBasis } from "@/lib/corporations/corpMarketShare";
import {
  buildMarketShareBySectorId,
  fetchAttackerDefenderShares,
  fetchSectorMarketSharePercent,
} from "@/lib/corporations/marketShare";

const PRESET = "2027-default";
const TURNS_PER_DAY = 24;

/** Live rows as the 2027 world carries them: euro members share one EUR row, FRF/ITL have none. */
function liveRows(): Map<CurrencyCode, number> {
  return new Map<CurrencyCode, number>([
    ["USD", 1],
    ["EUR", 0.9577],
  ]);
}
const engineMap = (): Map<CurrencyCode, number> => withAuthoredEraRates(liveRows(), PRESET);

const usCorpId = new ObjectId();
const itCorpId = new ObjectId();
const usCorp = {
  _id: usCorpId,
  countryId: "US",
  liquidCurrencyCode: "USD",
} as unknown as Corporation;
/** A euro-stamped domestic corp: its own sectors are stored in EUR, not ITL. */
const itCorp = {
  _id: itCorpId,
  countryId: "IT",
  liquidCurrencyCode: "EUR",
} as unknown as Corporation;

/** The sector's stored daily revenue, written the way the engine writes it. */
function engineStoredRevenue(
  sector: Pick<CorporateSector, "countryId">,
  owner: Corporation,
  receiptAnchorPerTurn: number
): number {
  return writeCorpEconomicLocal(
    receiptAnchorPerTurn * TURNS_PER_DAY,
    resolveSectorHostCurrencyCode(sector, owner),
    fxRateForSectorHostFromMap(sector, owner, engineMap())
  );
}

function sectorOf(
  countryId: string,
  owner: Corporation,
  receiptAnchorPerTurn: number,
  extra: Partial<CorporateSector> = {}
): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId: owner._id,
    stateId: `${countryId}_NW`,
    sectorType: "agriculture",
    countryId,
    revenue: engineStoredRevenue(
      { countryId } as Pick<CorporateSector, "countryId">,
      owner,
      receiptAnchorPerTurn
    ),
    profitMargin: 100,
    currentGrowthCost: 0,
    ...extra,
  } as unknown as CorporateSector;
}

const CASES: Array<[string, number, number]> = [
  ["IT", 1778.55, 833],
  ["FR", 51809, 4.2],
];

describe.each(CASES)("%s-hosted sector owned by a US corp", (countryId, receipt, ratio) => {
  const sector = sectorOf(countryId, usCorp, receipt);

  it("the stored value is the receipt scaled by the era rate", () => {
    expect(sector.revenue / (receipt * TURNS_PER_DAY)).toBeCloseTo(ratio, 6);
  });

  it("bond cap input: annual revenue matches the engine receipt on the valuation map", () => {
    const annual = sumCorporateSectorAnnualRevenue([sector], usCorpId, usCorp, engineMap());
    expect(annual).toBeCloseTo(receipt * TURNS_PER_YEAR, 3);
  });

  it("bond cap input: a live-only map reads it high by the era rate (the bug)", () => {
    const annual = sumCorporateSectorAnnualRevenue([sector], usCorpId, usCorp, liveRows());
    expect(annual / (receipt * TURNS_PER_YEAR)).toBeCloseTo(ratio, 3);
  });

  it("remittance basis: SOE operating income equals the receipt anchor revenue x 24", () => {
    const income = estimateNationalizedOperatingIncome(usCorp, [sector], engineMap(), new Map());
    expect(income).toBeCloseTo(receipt * TURNS_PER_DAY, 3);
    const inflated = estimateNationalizedOperatingIncome(usCorp, [sector], liveRows(), new Map());
    expect(inflated / (receipt * TURNS_PER_DAY)).toBeCloseTo(ratio, 3);
  });

  it("market share: shares a cell with a euro-stamped domestic sibling at true weights", () => {
    const domestic = { ...itCorp, _id: new ObjectId(), countryId } as unknown as Corporation;
    const domesticSector = sectorOf(countryId, domestic, receipt);
    const stateById = new Map([[sector.stateId, { _id: sector.stateId, countryId, gdp: 1 }]]);
    const shares = buildMarketShareBySectorId({
      sectors: [sector, domesticSector],
      corpById: new Map([
        [usCorpId.toString(), usCorp],
        [domestic._id.toString(), domestic],
      ]),
      stateById: stateById as never,
      exchangeRatesByCurrency: engineMap(),
    });
    // Same receipt anchor revenue on both sides => an even cell, whatever the stored units.
    expect(shares.get(sector._id.toString())).toBeCloseTo(50, 6);
    expect(shares.get(domesticSector._id.toString())).toBeCloseTo(50, 6);
  });
});

describe("domestic and live-row hosts are unchanged", () => {
  it("a US sector for a US corp and a DE sector (EUR live row) read the same on both maps", () => {
    for (const countryId of ["US", "DE"]) {
      const sector = {
        corporationId: usCorpId,
        countryId,
        revenue: 5000,
      } as unknown as CorporateSector;
      const live = sumCorporateSectorAnnualRevenue([sector], usCorpId, usCorp, liveRows());
      const era = sumCorporateSectorAnnualRevenue([sector], usCorpId, usCorp, engineMap());
      expect(era).toBe(live);
    }
  });

  it("an owner-aware share builder reads a euro-stamped domestic IT sector in EUR, not ITL", () => {
    const domesticSector = sectorOf("IT", itCorp, 1000);
    const foreignSector = sectorOf("IT", usCorp, 1000);
    const stateById = new Map([
      [domesticSector.stateId, { _id: domesticSector.stateId, countryId: "IT", gdp: 1 }],
    ]);
    const args = {
      sectors: [domesticSector, foreignSector],
      stateById: stateById as never,
      exchangeRatesByCurrency: engineMap(),
    };
    const withOwners = buildMarketShareBySectorId({
      ...args,
      corpById: new Map([
        [usCorpId.toString(), usCorp],
        [itCorpId.toString(), itCorp],
      ]),
    });
    expect(withOwners.get(domesticSector._id.toString())).toBeCloseTo(50, 6);
    // Without owners the builder cannot tell them apart and misreads the euro row at the lira rate.
    const withoutOwners = buildMarketShareBySectorId(args);
    expect(withoutOwners.get(domesticSector._id.toString())).not.toBeCloseTo(50, 1);
  });
});

describe("fillAuthoredEraRates", () => {
  function dbWithPreset(preset: string): Db {
    return {
      collection: () => ({ findOne: async () => ({ _id: "current", preset }) }),
    } as unknown as Db;
  }

  it("fills a copy and leaves the caller's map and live rates alone", async () => {
    const hoisted = liveRows();
    hoisted.set("FRF", 6.5);
    const filled = await fillAuthoredEraRates(dbWithPreset(PRESET), hoisted);
    expect(filled).not.toBe(hoisted);
    expect(hoisted.has("ITL")).toBe(false);
    expect(filled.get("ITL")).toBeCloseTo(833, 6);
    expect(filled.get("FRF")).toBe(6.5);
  });
});

describe("db-backed share readers resolve each sibling with its own owner", () => {
  const sector = sectorOf("IT", usCorp, 1778.55, { capitalStock: 10, plantCount: 1 });
  const domestic = sectorOf("IT", itCorp, 1778.55, { capitalStock: 10, plantCount: 1 });

  function fakeDb(): Db {
    const cursor = <T>(rows: T[]) => ({ toArray: async () => rows });
    const handlers: Record<string, unknown> = {
      states: { findOne: async () => ({ _id: sector.stateId, countryId: "IT", gdp: 1 }) },
      corporateSectors: { find: () => cursor([sector, domestic]) },
      corporations: { find: () => cursor([usCorp, itCorp]) },
      exchangeRates: {
        find: () =>
          cursor([
            { currencyCode: "USD", rate: 1 },
            { currencyCode: "EUR", rate: 0.9577 },
          ]),
      },
      gameState: { findOne: async () => ({ _id: "current", preset: PRESET }) },
    };
    return { collection: (name: string) => handlers[name] } as unknown as Db;
  }

  beforeEach(() => resetCorpFxRateCacheForTests());

  it("fetchSectorMarketSharePercent: equal receipt revenue is an even split", async () => {
    const pct = await fetchSectorMarketSharePercent(fakeDb(), sector, usCorp, undefined);
    expect(pct).toBeCloseTo(50, 6);
  });

  it("fetchAttackerDefenderShares: equal receipt revenue is an even split", async () => {
    const shares = await fetchAttackerDefenderShares(fakeDb(), domestic, itCorp, usCorpId);
    expect(shares.defenderSharePercent).toBeCloseTo(50, 6);
    expect(shares.attackerSharePercent).toBeCloseTo(50, 6);
  });

  it("loadIndustryBasis: the national rollup weights both owners at true size", async () => {
    const cursor = <T>(rows: T[]) => ({ project: () => cursor(rows), toArray: async () => rows });
    const handlers: Record<string, unknown> = {
      states: { find: () => cursor([{ _id: sector.stateId, countryId: "IT" }]) },
      corporateSectors: { find: () => cursor([sector, domestic]) },
      corporations: { find: () => cursor([usCorp, itCorp]) },
      exchangeRates: {
        find: () =>
          cursor([
            { currencyCode: "USD", rate: 1 },
            { currencyCode: "EUR", rate: 0.9577 },
          ]),
      },
      gameState: { findOne: async () => ({ _id: "current", preset: PRESET }) },
    };
    const db = { collection: (name: string) => handlers[name] } as unknown as Db;
    const basis = (await loadIndustryBasis(db, "IT", ["agriculture"])).get("agriculture")!;
    expect(basis.anchorByCorp.get(usCorpId.toString())).toBeCloseTo(1778.55 * TURNS_PER_DAY, 3);
    expect(basis.anchorByCorp.get(itCorpId.toString())).toBeCloseTo(1778.55 * TURNS_PER_DAY, 3);
  });
});
