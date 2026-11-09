/** Synthetic, database-free conversion replay. Never opens a Mongo connection.
 * Exercises the production persistence shells against the strict in-memory driver,
 * both conversion orders, and three successor budget/treasury/metric turns. */
import assert from "node:assert/strict";
import { ObjectId, type Db } from "mongodb";
import { getCountryConfig, type CountryId } from "../../src/lib/constants/countries";
import { createInMemoryDb } from "../../src/lib/test-utils/inMemoryDb";
import { expandToSubRegions } from "../../src/lib/referendum/secede/expandToSubRegions";
import { promoteEconomyToNational } from "../../src/lib/referendum/secede/promoteEconomyToNational";
import { promoteResetV2ForIndependence } from "../../src/lib/referendum/secede/promoteResetV2";
import { convertLawPrograms } from "../../src/lib/referendum/conversionPrograms";
import { loadReviewedLawCatalog } from "../../src/lib/resetLegislation/loadReviewedCatalog";
import { processRegionalBudgets } from "../../src/lib/turn/regionalBudget";
import { buildOpeningMetricSnapshots1991 } from "../../src/lib/resetMetrics/seedOpening1991";
import { buildOpeningLawBoards1991 } from "../../src/lib/resetLegislation/openingBoards1991";
import { buildOpeningRegionalBoards1991 } from "../../src/lib/resetFinance/openingRegionalBoards1991";
import { buildOpeningDepartmentBoards1991 } from "../../src/lib/resetFinance/openingDepartmentBoards1991";
import { buildOpeningDepartmentFundingPartition } from "../../src/lib/resetFinance/rules/liveDepartmentAccount";
import { openingNationalTreasurySnapshots } from "../../src/lib/resetFinance/rules/treasurySnapshot";
import { DEPARTMENT_DEFINITIONS } from "../../src/lib/governmentFinance/departmentCatalog";
import { RESET_V2_SEED_REVISION } from "../../src/lib/resetVersions/rules";
import { settleResetTreasuryCashTurn } from "../../src/lib/resetFinance/settleCashTurn";
import { collectResetMetricOwnerReadings } from "../../src/lib/resetMetrics/collectOwnerReadings";
import { refreshResetMetricBoard } from "../../src/lib/resetMetrics/rules/refresh";
import { producerWalletId } from "../../src/lib/turn/corporation/producerWallets";
import {
  producerPayableId,
  settlePriorProducerPayables,
} from "../../src/lib/market/producerMarket/payablesRules";
import { setPath } from "../../src/lib/referendum/secede/docScale";
import type { GameState } from "../../src/lib/db/types/gameState";
import type { BondTurnResult } from "../../src/lib/turn/bondTurn";
import type { ResetMetricSnapshot } from "../../src/lib/resetMetrics/rules/snapshot";
import type { ProducerPayable } from "../../src/lib/market/producerMarket/payablesRules";

type Country = "SCO" | "WAL";
const worldId = "synthetic-independence-continuity";
const close = (a: number, b: number, name: string) =>
  assert(Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-12), `${name}: ${a} != ${b}`);

export async function simulateIndependenceContinuity(order: readonly Country[]) {
  const memory = createInMemoryDb(),
    db = memory as unknown as Db;
  const read = (name: string) => memory.collection(name).docs;
  const sum = (name: string, field: string) =>
    read(name).reduce((s, r) => s + Number(r[field] ?? 0), 0);
  const cashByCurrency = (name: string, field: string) => {
    const totals: Record<string, number> = {};
    for (const row of read(name)) {
      const currency = String(
        row.currencyCode ??
          row.currency ??
          getCountryConfig(row.countryId as CountryId).currencyCode
      );
      totals[currency] = (totals[currency] ?? 0) + Number(row[field] ?? 0);
    }
    return totals;
  };
  const regional = [
    {
      _id: "LON",
      countryId: "UK",
      name: "London",
      population: 12_000_000,
      gdp: 720_000,
      capitalStock: 2_160_000,
    },
    {
      _id: "SCO",
      countryId: "UK",
      name: "Scotland",
      population: 5_000_003,
      gdp: 200_000,
      capitalStock: 600_000,
    },
    {
      _id: "WAL",
      countryId: "UK",
      name: "Wales",
      population: 3_000_001,
      gdp: 80_000,
      capitalStock: 240_000,
    },
  ];
  memory.seed("states", regional);
  memory.seed("exchangeRates", [{ _id: "UK", currencyCode: "GBP", rate: 0.8 }]);
  memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      resetWorldId: worldId,
      preset: "1991-default",
      startingYear: 1991,
      metricsSystemVersion: "v2",
      legislationSystemVersion: "v2",
      cabinetSystemVersion: "v2",
      demographicsSystemVersion: "v2",
      resetVersionSeeds: Object.fromEntries(
        ["metrics", "legislation", "cabinet", "demographics"].map((system) => [
          system,
          {
            worldId,
            revision: RESET_V2_SEED_REVISION[system as keyof typeof RESET_V2_SEED_REVISION],
            sourceTurn: 1,
            completedAt: "synthetic",
            verificationHash: "synthetic",
            countries: ["UK"],
          },
        ])
      ),
    },
  ]);
  memory.seed(
    "regionDemographics",
    regional.map((row) => ({
      _id: row._id,
      countryId: "UK",
      lastUpdated: new Date(0),
      ages: {
        male: Array(101).fill(row.population / 202),
        female: Array(101).fill(row.population / 202),
      },
    }))
  );
  const boards = buildOpeningMetricSnapshots1991(worldId, 1)
    .filter(
      (row) =>
        row.countryId === "UK" &&
        (row.scope === "national" || regional.some((region) => region._id === row.regionId))
    )
    .map((row) => ({ ...row, asOfTurn: 100 }));
  memory.seed("resetMetricSnapshots", boards);
  memory.seed(
    "macroMetrics",
    boards
      .filter((row) => row.scope === "regional")
      .map((board) => {
        const row: Record<string, unknown> = { _id: board.regionId, countryId: "UK" };
        for (const observation of Object.values(board.observations))
          setPath(row, observation.path, { value: observation.value });
        return row;
      })
  );
  memory.seed(
    "resetLawOpeningBoards",
    buildOpeningLawBoards1991(worldId, 1)
      .filter((row) => row.countryId === "UK")
      .map((row) => ({
        ...row,
        references: Object.fromEntries(
          Object.entries(row.references).filter(
            ([family]) => !(row.scope === "national" && family === "L02")
          )
        ),
      }))
  );
  memory.seed(
    "resetRegionalOpeningBoards",
    buildOpeningRegionalBoards1991(worldId, 1)
      .filter((row) => row.countryId === "UK")
      .map((row) => ({ ...row }))
  );
  const partition = buildOpeningDepartmentFundingPartition(
    buildOpeningDepartmentBoards1991(worldId, 1).filter((row) => row.countryId !== "IE"),
    DEPARTMENT_DEFINITIONS,
    {},
    {}
  );
  for (const row of partition.accounts) {
    row.accruedThroughTurn = 100;
    row.balance = 100_003;
  }
  memory.seed(
    "resetDepartmentAccounts",
    partition.accounts.map((row) => ({ ...row }))
  );
  memory.seed(
    "resetDepartmentContinuity",
    partition.continuity.map((row) => ({ ...row }))
  );
  const treasuries = openingNationalTreasurySnapshots(
    worldId,
    1,
    {
      UK: { debt: 100_000_000, debtCeiling: 1e15 },
      US: { debt: 0, debtCeiling: 1e15 },
      JP: { debt: 0, debtCeiling: 1e15 },
    },
    partition.accounts
  );
  for (const row of treasuries) {
    row.cash = 1e12;
    row.settledThroughTurn = 100;
  }
  memory.seed(
    "resetNationalTreasuries",
    treasuries.map((row) => ({ ...row }))
  );
  memory.seed("federalBudget", [
    {
      _id: "UK",
      countryId: "UK",
      currencyCode: "GBP",
      gdp: 1e12,
      gdpSmoothed: 1e12,
      treasuryBalance: 1_000_000_003,
      treasuryCashLocal: 1_000_000_003,
      revenue: { total: 1e10 },
      spending: { total: 1e10, debtInterest: 0, stateGrants: 1e8 },
      debt: { principal: 100_000_000, ceiling: 1e15, interestRate: 3 },
      economicFactors: { inflationRate: 2 },
    },
    ...["US", "JP"].map((countryId) => ({
      _id: countryId,
      countryId,
      currencyCode: getCountryConfig(countryId as CountryId).currencyCode,
      gdp: 1e12,
      revenue: { total: 0 },
      spending: { total: 0, debtInterest: 0, stateGrants: 0 },
      debt: { principal: 0, ceiling: 1e15 },
    })),
  ]);
  memory.seed("militaryUnits", [
    { _id: new ObjectId(), countryId: "UK", basePower: 100, readiness: 83 },
  ]);
  memory.seed("bonds", [
    {
      _id: new ObjectId(),
      issuerType: "sovereign",
      countryId: "UK",
      matured: false,
      defaulted: false,
      totalIssued: 100_000_000,
      publicFloat: 25_000_000,
      holders: [{ holderId: "synthetic-holder", units: 75_000_000 }],
    },
  ]);
  memory.seed(
    "regionalBudgets",
    order.map((id) => ({
      _id: id,
      countryId: "UK",
      totalBudget: 1_000_003,
      fundedBillCosts: 1_000_003,
      unfundedBillCosts: 0,
      enactedBillCosts: 1_000_003,
      surplus: 0,
      programSettlements: {
        [`${worldId}:UK:${id}:L10`]: {
          programId: `${worldId}:UK:${id}:L10`,
          authorizedCost: 1_000_003,
          fundedAmount: 1_000_003,
          unfundedAmount: 0,
          implementationFactor: 1,
          lastSettledTurn: 100,
          validThroughTurn: 101,
        },
      },
    }))
  );
  memory.seed("resetLawPrograms", [
    ...order.map((id) => ({
      _id: `${worldId}:UK:${id}:L10`,
      worldId,
      country: "UK",
      regionId: id,
      scope: "regional",
      familyId: "L10",
      choice: "center_left",
      annualAgencyAllocation: 1_000_003,
      effectiveTurn: 1,
      fundingAccountId: "regional_budget",
      primaryMetricEffects: [],
    })),
    ...["L10", "L01"].map((familyId) => ({
      _id: `${worldId}:UK:national:${familyId}`,
      worldId,
      country: "UK",
      scope: "national",
      familyId,
      choice: "center_right",
      annualAgencyAllocation: 0,
      effectiveTurn: 1,
      supersededSourceIds: [],
      fundingAccountId: partition.accounts.find(
        (account) =>
          account.countryId === "UK" && Object.hasOwn(account.familyAnnualDemand, familyId)
      )!._id,
      legalAuthorityId: `UK:national:${familyId}`,
      serviceDelivererId: partition.accounts.find(
        (account) =>
          account.countryId === "UK" && Object.hasOwn(account.familyAnnualDemand, familyId)
      )!.departmentId,
      titleSnapshot: "Inherited national statute",
      descriptionSnapshot: "Synthetic national law",
      primaryMetricEffects: [],
    })),
  ]);
  memory.seed(
    "stateResourceCapacity",
    order.map((id) => ({
      _id: new ObjectId(),
      countryId: "UK",
      stateId: id,
      resources: { oil: 100_003, natural_gas: 200_007, timber: 30_011 },
      extractedUnits: { oil: 31_001.125 },
    }))
  );
  memory.seed(
    "corporateSectors",
    order.flatMap((id, index) => [
      {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "UK",
        stateId: id,
        sectorType: "extraction",
        strategyId: "standard",
        capitalStock: 100_000,
        capacityBase: 1e5,
        revenue: 1e6,
        workers: 100 + index,
        producerInventory: { worldEpoch: worldId, turn: 100, inputStock: [], outputStock: [] },
      },
      {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "UK",
        stateId: id,
        sectorType: "energy",
        strategyId: "standard",
        capitalStock: 1000,
        revenue: 1000,
        workers: 50,
      },
    ])
  );
  const creditor = producerWalletId(worldId, {
    kind: "households",
    countryId: "UK",
    stateId: "SCO",
    currency: "GBP",
  });
  const claim = {
    debtorAccountId: "foreign-corp",
    creditorAccountId: creditor,
    producerId: "synthetic-site",
    kind: "labour" as const,
    amount: 1234.5,
  };
  memory.seed("corporations", [
    {
      _id: new ObjectId(),
      producerPayables: {
        worldEpoch: worldId,
        turn: 100,
        claims: [{ ...claim, id: producerPayableId(claim) }],
      },
    },
  ]);
  memory.seed(
    "producerEconomyAccounts",
    order.flatMap((id) =>
      ["households", "operatingPayee"].map((kind) => ({
        _id: producerWalletId(worldId, {
          kind: kind as "households" | "operatingPayee",
          countryId: "UK",
          stateId: id,
          currency: "GBP",
        }),
        kind,
        worldEpoch: worldId,
        countryId: "UK",
        stateId: id,
        currency: "GBP",
        cash: kind === "households" ? 70003.125 : 137.5,
      }))
    )
  );
  const before = {
    population: sum("states", "population"),
    gdp: sum("states", "gdp"),
    capital: sum("states", "capitalStock"),
    wallet: sum("producerEconomyAccounts", "cash"),
    treasury: sum("resetNationalTreasuries", "cash"),
    department: sum("resetDepartmentAccounts", "balance"),
    bonds: sum("bonds", "totalIssued"),
    workers: sum("corporateSectors", "workers"),
    treasuryByCurrency: cashByCurrency("resetNationalTreasuries", "cash"),
    departmentByCurrency: cashByCurrency("resetDepartmentAccounts", "balance"),
    authorityByCurrency: cashByCurrency("resetDepartmentAccounts", "annualAuthority"),
  };
  for (const country of order) {
    await expandToSubRegions(db, country);
    await promoteEconomyToNational(db, "UK", country, 100);
    await promoteResetV2ForIndependence(db, country, 100);
    await convertLawPrograms(db, { regionId: country, countryId: country, independent: true });
  }
  close(sum("states", "population"), before.population, "population");
  close(sum("states", "gdp"), before.gdp, "GDP");
  close(sum("states", "capitalStock"), before.capital, "capital");
  close(sum("corporateSectors", "workers"), before.workers, "workers");
  close(sum("producerEconomyAccounts", "cash"), before.wallet, "wallet cash");
  close(sum("resetNationalTreasuries", "cash"), before.treasury, "treasury cash");
  close(sum("resetDepartmentAccounts", "balance"), before.department, "department cash");
  for (const [name, field, opening] of [
    ["resetNationalTreasuries", "cash", before.treasuryByCurrency],
    ["resetDepartmentAccounts", "balance", before.departmentByCurrency],
    ["resetDepartmentAccounts", "annualAuthority", before.authorityByCurrency],
  ] as const) {
    const closing = cashByCurrency(name, field);
    assert.deepEqual(Object.keys(closing).sort(), Object.keys(opening).sort());
    for (const [currency, amount] of Object.entries(opening))
      close(closing[currency], amount, `${name} ${currency}`);
  }
  close(sum("bonds", "totalIssued"), before.bonds, "sovereign issued face");
  for (const [resource, amount] of Object.entries({
    oil: 100_003,
    natural_gas: 200_007,
    timber: 30_011,
  })) {
    close(
      read("stateResourceCapacity").reduce(
        (sum, row) => sum + Number((row.resources as Record<string, number>)[resource] ?? 0),
        0
      ),
      order.length * amount,
      `${resource} capacity`
    );
  }
  close(
    read("stateResourceCapacity").reduce(
      (sum, row) => sum + Number((row.extractedUnits as Record<string, number>)?.oil ?? 0),
      0
    ),
    order.length * 31_001.125,
    "oil depletion"
  );
  assert.equal(read("corporateSectors").length, order.length * 2, "plant holdings preserved");
  assert.equal(
    read("corporateSectors").filter((row) => row.producerInventory).length,
    order.length,
    "inventory witnesses preserved"
  );
  close(
    read("regionDemographics").reduce(
      (s, r) =>
        s +
        Object.values(r.ages as Record<string, number[]>)
          .flat()
          .reduce((a, b) => a + b, 0),
      0
    ),
    before.population,
    "fractional cohorts"
  );
  close(
    sum("regionalBudgets", "fundedBillCosts") + sum("regionalBudgets", "surplus"),
    order.length * 1_000_003,
    "regional funding retained or released"
  );
  for (const country of order) {
    const laws = read("resetLawPrograms").filter(
      (row) => row.country === country && row.familyId === "L10"
    );
    assert.equal(laws.length, 1, "one promoted law, not a copy in every region");
    assert.equal(laws[0].scope, "national");
    assert.equal(laws[0].choice, "center_left");
    assert.equal(laws[0].effectiveTurn, 1);
    const inherited = read("resetLawPrograms").find(
      (row) => row.country === country && row.familyId === "L01"
    );
    assert.equal(
      inherited?.choice,
      "center_right",
      "UK choice remains where no regional law overrides it"
    );
    const catalog = await loadReviewedLawCatalog({
      db,
      worldId,
      country,
      scope: "national",
      year: 1993,
    });
    assert.equal(catalog.find((family) => family.familyId === "L10")?.currentChoice, "center_left");
    assert(
      catalog.some((family) => family.familyId === "L02"),
      "missing default remains proposable"
    );
    assert(
      catalog.every((family) =>
        family.options.every((option) => Number.isSafeInteger(option.annualAllocationDelta))
      ),
      "future national law changes retain whole-currency funding deltas"
    );
  }
  const claims = read("corporations").flatMap(
    (row) => (row.producerPayables as { claims: ProducerPayable[] }).claims
  );
  close(
    claims.reduce((s, row) => s + row.amount, 0),
    1234.5,
    "foreign wage arrears"
  );
  assert(claims.every((row) => row.creditorAccountId !== creditor));
  const paid = settlePriorProducerPayables({
    accounts: [
      { id: "foreign-corp", cash: 2000 },
      ...read("producerEconomyAccounts").map((row) => ({
        id: String(row._id),
        cash: Number(row.cash),
      })),
    ],
    payables: claims,
  });
  close(
    paid.payments.reduce((s, row) => s + row.amount, 0),
    1234.5,
    "post-independence invoice payment"
  );
  const outcomes = [];
  for (let turn = 101; turn <= 103; turn++) {
    for (const country of ["UK", ...order] as const)
      await processRegionalBudgets(db, turn, 1, false, true, worldId, country);
    const gameState = await db.collection<GameState>("gameState").findOne({ _id: "current" });
    const settlement = await settleResetTreasuryCashTurn({
      db,
      gameState: gameState!,
      turn,
      bondFlows: {
        sovereignCashProceedsByCountry: {},
        sovereignDebtFaceIssuedByCountry: {},
        sovereignCouponPaidByCountry: {},
        sovereignMaturityCashPaidByCountry: {},
        sovereignDebtFaceRetiredByCountry: {},
      } as BondTurnResult,
    });
    const national = read("resetMetricSnapshots").filter(
      (row) => row.scope === "national"
    ) as unknown as ResetMetricSnapshot[];
    const readings = await collectResetMetricOwnerReadings(db, national, turn, 1993);
    for (const board of national) {
      const result = refreshResetMetricBoard({
        board,
        turn,
        ...readings[board._id]!,
        allowCatchUp: true,
      });
      assert.deepEqual(result.missingDueIds, [], `${board.countryId} national owners`);
      await db
        .collection<ResetMetricSnapshot>("resetMetricSnapshots")
        .replaceOne({ _id: board._id }, result.board);
    }
    const regionalBudgets = read("regionalBudgets").filter((row) =>
      order.includes(row.countryId as Country)
    );
    for (const country of order) {
      const delivery = read("resetDepartmentAccounts")
        .filter((account) => account.countryId === country)
        .flatMap((account) =>
          Object.entries(
            account.lastProgramDelivery as Record<string, { implementationFactor: number }>
          )
        )
        .find(([family]) => family === "L10");
      assert(
        delivery && delivery[1].implementationFactor > 0,
        `${country} promoted law receives actual national delivery`
      );
    }
    assert(regionalBudgets.every((row) => row.turn === turn));
    assert(
      regionalBudgets.every((row) =>
        Object.values(
          row.programSettlements as Record<string, { implementationFactor: number }>
        ).every((s) => s.implementationFactor === 1)
      )
    );
    outcomes.push({
      turn,
      regionsUpdated: regionalBudgets.length,
      countriesSettled: settlement.countries,
      fiscalRecordsAdvanced: settlement.advanced,
    });
    await db
      .collection<GameState>("gameState")
      .updateOne({ _id: "current" }, { $set: { currentTurn: turn } });
  }
  return { order, before, conservation: "passed", postIndependence: outcomes };
}

if (process.argv[1]?.endsWith("independenceContinuity.ts")) {
  (async () => {
    for (const order of [
      ["SCO", "WAL"],
      ["WAL", "SCO"],
    ] as const)
      console.log(JSON.stringify(await simulateIndependenceContinuity(order)));
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
