import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { migrateProducerWallets } from "./migrateProducerWallets";
import { splitProducerWallets, remapProducerPayables } from "./rules/producerWallets";
import { producerWalletId } from "@/lib/turn/corporation/producerWallets";
import {
  producerPayableId,
  settlePriorProducerPayables,
} from "@/lib/market/producerMarket/payablesRules";
import { extractionAllocationWeights, splitExtractionFields } from "./rules/extraction";
import { splitRegionalFinance } from "./rules/regionalFinance";
import { splitHousingState } from "./rules/metricContinuity";
import { validateHousingState } from "@/lib/resetMetrics/rules/housing";
import { SUB_REGION_SEEDS } from "./subRegions";
import { populationWeights, splitCountVector } from "./apportion";
import { buildSuccessorMetricRows } from "./rules/resetV2Promotion";
import { buildOpeningMetricSnapshots1991 } from "@/lib/resetMetrics/seedOpening1991";
import { simulateIndependenceContinuity } from "../../../../scripts/sim/independenceContinuity";

describe("independence continuity", () => {
  it.each(["SCO", "WAL"] as const)(
    "moves %s cash and foreign wage debts, leaving historical wallets empty",
    async (countryId) => {
      const memory = createInMemoryDb(),
        db = memory as unknown as Db;
      const id = producerWalletId("world", {
        kind: "households",
        countryId: "UK",
        stateId: countryId,
        currency: "GBP",
      });
      const source = {
        _id: id,
        worldEpoch: "world",
        kind: "households" as const,
        countryId: "UK",
        stateId: countryId,
        currency: "GBP",
        cash: 10003.125,
      };
      const claim = {
        debtorAccountId: "foreign",
        creditorAccountId: id,
        producerId: "site",
        kind: "labour" as const,
        amount: 1234.5,
      };
      const corporationId = new ObjectId();
      memory.seed("producerEconomyAccounts", [source]);
      memory.seed("exchangeRates", [{ _id: "UK", currencyCode: "GBP", rate: 0.8 }]);
      memory.seed("corporations", [
        {
          _id: corporationId,
          producerPayables: {
            worldEpoch: "world",
            turn: 1,
            claims: [{ ...claim, id: producerPayableId(claim) }],
          },
        },
      ]);
      await migrateProducerWallets(db, countryId, SUB_REGION_SEEDS[countryId], 101);
      const wallets = memory.collection("producerEconomyAccounts").docs;
      expect(wallets.find((row) => row._id === id)!.cash).toBe(0);
      expect(wallets.reduce((sum, row) => sum + Number(row.cash), 0)).toBe(source.cash);
      const entries = memory.collection("ledgerEntries").docs;
      expect(entries).toHaveLength(1);
      expect(entries[0].balanced).toBe(true);
      expect(entries[0].turn).toBe(101);
      const claims = (
        memory.collection("corporations").docs[0].producerPayables as { claims: (typeof claim)[] }
      ).claims;
      expect(claims.every((row) => row.creditorAccountId !== id)).toBe(true);
      expect(claims.reduce((sum, row) => sum + row.amount, 0)).toBe(claim.amount);
      const result = settlePriorProducerPayables({
        accounts: [
          { id: "foreign", cash: 2000 },
          ...wallets.map((row) => ({ id: String(row._id), cash: Number(row.cash) })),
        ],
        payables: claims.map((row) => ({ ...row, id: producerPayableId(row) })),
      });
      expect(result.payables).toEqual([]);
      expect(result.payments.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(
        claim.amount,
        9
      );
      await expect(
        migrateProducerWallets(db, countryId, SUB_REGION_SEEDS[countryId], 101)
      ).rejects.toThrow("already exists");
      expect(wallets.reduce((sum, row) => sum + Number(row.cash), 0)).toBe(source.cash);
    }
  );

  it("remaps wallet debt as well as creditors without changing invoice age or principal", () => {
    const source = {
      _id: "old",
      worldEpoch: "world",
      kind: "operatingPayee" as const,
      countryId: "UK",
      currency: "GBP",
      cash: 9.125,
    };
    const { map, wallets } = splitProducerWallets([source], "SCO", [
      { _id: "A", population: 1 },
      { _id: "B", population: 2 },
    ]);
    const claim = {
      debtorAccountId: "old",
      creditorAccountId: "supplier",
      producerId: "site",
      kind: "operating" as const,
      amount: 20,
      notShrinkingSince: 5,
    };
    const rows = remapProducerPayables([{ ...claim, id: producerPayableId(claim) }], map);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(20);
    expect(
      rows.every(
        (row) =>
          row.notShrinkingSince === 5 &&
          wallets.some((wallet) => wallet._id === row.debtorAccountId)
      )
    ).toBe(true);
  });

  it("fails before moving cash when a producer payment is unfinished", async () => {
    const memory = createInMemoryDb();
    memory.seed("producerEconomyAccounts", [
      {
        _id: "old",
        kind: "households",
        countryId: "UK",
        stateId: "WAL",
        worldEpoch: "world",
        currency: "GBP",
        cash: 100,
        pendingMoneyMoveReceipt: { key: "pending" },
      },
    ]);
    await expect(
      migrateProducerWallets(memory as unknown as Db, "WAL", SUB_REGION_SEEDS.WAL, 101)
    ).rejects.toThrow("must settle");
    expect(memory.collection("producerEconomyAccounts").docs).toHaveLength(1);
    expect(memory.collection("producerEconomyAccounts").docs[0].cash).toBe(100);
  });

  it("allocates each resource and its depletion to the same regional extraction recipe", () => {
    const fallback = { A: 0.6, B: 0.4 };
    const weights = extractionAllocationWeights(fallback, [
      { regionId: "A", capacity: 100, supply: { oil: 1 } },
      { regionId: "B", capacity: 300, supply: { coal: 1 } },
    ]);
    const source = {
      resources: { oil: 500, coal: 600, timber: 100 },
      extractedUnits: { oil: 25, coal: 30 },
    };
    const split = Object.entries(fallback).map(([id, weight]) =>
      splitExtractionFields(
        source,
        weight,
        "SCO",
        id,
        true,
        Object.fromEntries(Object.entries(weights).map(([resource, rows]) => [resource, rows[id]]))
      )
    );
    expect(split[0].resources).toEqual({ oil: 500, coal: 0, timber: 60 });
    expect(split[1].resources).toEqual({ oil: 0, coal: 600, timber: 40 });
    expect(split[0].extractedUnits).toEqual({ oil: 25, coal: 0 });
    expect(split[1].extractedUnits).toEqual({ oil: 0, coal: 30 });
  });

  it("divides financial settlements without scaling their implementation factor or dates", () => {
    const source = {
      stateId: "SCO",
      fundedBillCosts: 100,
      unfundedBillCosts: 20,
      chancellorAllocation: 12,
      programSettlements: {
        "w:UK:SCO:L10": {
          programId: "w:UK:SCO:L10",
          authorizedCost: 120,
          fundedAmount: 100,
          unfundedAmount: 20,
          implementationFactor: 5 / 6,
          lastSettledTurn: 9,
          validThroughTurn: 10,
        },
      },
    };
    const row = splitRegionalFinance(
      source,
      { countryId: "SCO", fromCountryId: "UK", regionId: "SCO" },
      "LOT",
      0.25
    );
    expect(row).toMatchObject({
      stateId: "LOT",
      fundedBillCosts: 25,
      unfundedBillCosts: 5,
      chancellorAllocation: 3,
    });
    expect((row.programSettlements as Record<string, unknown>)["w:SCO:LOT:L10"]).toMatchObject({
      authorizedCost: 30,
      fundedAmount: 25,
      implementationFactor: 5 / 6,
      lastSettledTurn: 9,
      validThroughTurn: 10,
    });
  });

  it.each(["SCO", "WAL"] as const)(
    "preserves %s housing and fractional cohort stocks",
    (country) => {
      const weights = populationWeights(SUB_REGION_SEEDS[country]);
      const source = {
        worldId: "world",
        countryId: "UK",
        regionId: country,
        asOfTurn: 99,
        usableDwellings: 1003,
        occupiedDwellings: 997,
        unhousedPeople: 5,
        constructionCash: 10007,
        pipeline: [{ id: "project", dwellings: 17, earliestCompletionTurn: 110 }],
      };
      const rows = Object.values(splitHousingState(source, country, weights));
      rows.forEach(validateHousingState);
      for (const field of [
        "usableDwellings",
        "occupiedDwellings",
        "unhousedPeople",
        "constructionCash",
      ] as const)
        expect(rows.reduce((sum, row) => sum + row[field], 0)).toBe(source[field]);
      expect(rows.flatMap((row) => row.pipeline).reduce((sum, row) => sum + row.dwellings, 0)).toBe(
        17
      );
      const vectors = Object.values(splitCountVector([1.25, 10.625], weights));
      expect(vectors.reduce((sum, row) => sum + row[0], 0)).toBeCloseTo(1.25, 12);
      expect(vectors.reduce((sum, row) => sum + row[1], 0)).toBeCloseTo(10.625, 12);
    }
  );

  it.each(["SCO", "WAL"] as const)(
    "starts %s national history at conversion with its own fiscal and force values",
    (countryId) => {
      const boards = buildOpeningMetricSnapshots1991("world", 1);
      const rows = buildSuccessorMetricRows({
        countryId,
        aggregate: boards.find((row) => row._id === `UK:${countryId}`)!,
        national: boards.find((row) => row._id === "UK:national")!,
        regions: SUB_REGION_SEEDS[countryId].map((row) => ({
          id: row._id,
          population: row.population,
        })),
        turn: 100,
        fiscal: { gdp: 1000, revenue: 100, spending: 110, debtPrincipal: 300, inflationRate: 2 },
      });
      expect(rows[0].observations["57"].value).toBe(0);
      expect(rows[0].observations["10"].value).toBe(30);
      expect(rows[0].observations["09"].value).toBe(-1);
      expect(rows[0].observations["58"].status).toBe("proxy");
      expect(
        Object.values(rows[0].history!).every(
          (series) => series.length === 1 && series[0].turn === 100
        )
      ).toBe(true);
    }
  );

  it.each([
    ["SCO", "WAL"],
    ["WAL", "SCO"],
  ] as const)(
    "replays both conversions and three actual fiscal/metric turns (%s first)",
    async (first, second) => {
      const report = await simulateIndependenceContinuity([first, second]);
      expect(report.conservation).toBe("passed");
      expect(report.postIndependence).toHaveLength(3);
      expect(
        report.postIndependence.every(
          (row) => row.regionsUpdated === 13 && row.countriesSettled === 5
        )
      ).toBe(true);
    }
  );
});
