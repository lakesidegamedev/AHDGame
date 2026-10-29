import { describe, expect, it, vi } from "vitest";
import type { Corporation, CorporateSector } from "@/lib/db/types/corporation";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { loadArrearsView } from "@/lib/corporations/queries/corporationDetail/arrears";
import { producerPayableId } from "./payablesRules";
import { collectBalances } from "@/lib/ledger/balanceSnapshot";
import { reconcileLedger } from "@/lib/ledger/reconcile";
import type { LedgerEntry } from "@/lib/ledger/types";
import { snapshotMoneySupply } from "@/lib/moneySupply/snapshot";
import { settleProducerTurn } from "./settlement";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { prepareProducerSector } from "@/lib/turn/corporation/producerSectorPlan";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const corporationId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const sectorId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const newOwnerId = "dddddddddddddddddddddddd";
const thirdOwnerId = "eeeeeeeeeeeeeeeeeeeeeeee";
const openingDailyUnits = (10 * TURNS_PER_DAY) / (1 - CAPITAL_DEPRECIATION_PER_TURN);

function fixture() {
  const memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      worldEpochId: "example",
      isActive: true,
      processingKind: "turn",
      isProcessing: true,
      processingTargetTurn: 1,
    },
  ]);
  memory.seed("corporations", [
    {
      _id: new ObjectId(corporationId),
      liquidCapital: 1000,
      producerPayables: { worldEpoch: "example", turn: 0, claims: [] },
      liquidCurrencyCode: "USD",
      countryId: "US",
      userId: new ObjectId("cccccccccccccccccccccccc"),
      bankCharter: { cashReserves: 9000, totalLoans: 6000, totalDeposits: 8000 },
    },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: new ObjectId(sectorId),
      corporationId: new ObjectId(corporationId),
      sectorType: "manufacturing",
      pricingPosture: 0.2,
      capitalStock: openingDailyUnits,
      capacityBookAnchor: 100,
      buildQueue: [],
      producerCapacity: { worldEpoch: "example", turn: 0 },
      producerInventory: { worldEpoch: "example", turn: 0, inputStock: [], outputStock: [] },
    },
  ]);
  memory.seed("producerEconomyAccounts", [
    {
      _id: "households",
      worldEpoch: "example",
      cash: 100,
      currency: "USD",
      kind: "households",
      countryId: "US",
    },
    {
      _id: "operating",
      worldEpoch: "example",
      cash: 0,
      currency: "USD",
      kind: "operatingPayee",
      countryId: "US",
    },
  ]);
  const input: Parameters<typeof settleProducerTurn>[1] = {
    worldEpoch: "example",
    production: {
      turn: 1,
      accounts: [
        { id: "corp", cash: 500 },
        { id: "households", cash: 50 },
        { id: "operating", cash: 0 },
      ],
      producers: [
        {
          id: "plant",
          accountId: "corp",
          activeFraction: 1,
          outputMultiplier: 1,
          inputs: [],
          outputs: [
            {
              commodity: "goods",
              book: "world",
              unitsPerOutput: 1,
              policy: { kind: "manual", unitPrice: 3 },
              referenceUnitPrice: 3,
              storable: true,
            },
          ],
          labourCost: 10,
          otherOperatingCost: 5,
          labourRecipientAccountId: "households",
          operatingRecipientAccountId: "operating",
          inputStock: [],
          outputStock: [],
        },
      ],
      households: [
        {
          accountId: "households",
          spendFraction: 1,
          products: [{ commodity: "goods", book: "world", maximumUnitPrice: 3, weight: 1 }],
        },
      ],
    },
    bindings: [
      {
        kind: "corporation",
        accountId: "corp",
        corporationId,
        currency: "USD",
        localPerAnchor: 2,
        openingCashLocal: 1000,
      },
      {
        kind: "economyAccount",
        accountId: "households",
        economyAccountId: "households",
        currency: "USD",
        localPerAnchor: 2,
        openingCashLocal: 100,
      },
      {
        kind: "economyAccount",
        accountId: "operating",
        economyAccountId: "operating",
        currency: "USD",
        localPerAnchor: 2,
        openingCashLocal: 0,
      },
    ],
    targets: [
      {
        producerId: "plant",
        sectorId,
        corporationId,
        capacity: {
          completedTurn: 0,
          ownedDailyUnits: openingDailyUnits,
          paidBookAnchor: 100,
          buildQueue: [],
        },
        operatingRecipeRatio: 1,
        recessionCapacityFactor: 1,
        plantType: { sectorType: "manufacturing" },
      },
    ],
  };
  return { memory, input, db: memory as unknown as Db };
}

/** Add a corporation that settles this turn, so redirected cash has an account. */
function addSecondCorporation(
  memory: ReturnType<typeof createInMemoryDb>,
  input: Parameters<typeof settleProducerTurn>[1],
  id: string
) {
  memory.seed("corporations", [
    {
      _id: new ObjectId(id),
      liquidCapital: 0,
      producerPayables: { worldEpoch: "example", turn: 0, claims: [] },
      liquidCurrencyCode: "USD",
      countryId: "US",
      userId: new ObjectId("ffffffffffffffffffffffff"),
    },
  ]);
  input.production.accounts = [...input.production.accounts, { id, cash: 0 }];
  input.bindings = [
    ...input.bindings,
    {
      kind: "corporation",
      accountId: id,
      corporationId: id,
      currency: "USD",
      localPerAnchor: 2,
      openingCashLocal: 0,
    },
  ];
}

function corporationById(memory: ReturnType<typeof createInMemoryDb>, id: string) {
  return memory
    .collection("corporations")
    .docs.find((corp) => (corp._id as ObjectId).toHexString() === id);
}

describe("frozen producer turn settlement", () => {
  it("settles a real finance-sector plan with the common quote and a physical branch allocation", async () => {
    const { memory, input, db } = fixture();
    await db.collection<CorporateSector>("corporateSectors").updateOne(
      { _id: new ObjectId(sectorId) },
      {
        $set: {
          sectorType: "financial",
          producerQuotes: { financial_services: { kind: "manual", unitPrice: 3 } },
        },
      }
    );
    const sector = (await db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: new ObjectId(sectorId) }))!;
    const prepared = prepareProducerSector({
      worldEpoch: "example",
      turn: 1,
      sector,
      recipe: { supply: { financial_services: 1 }, demand: {}, eraUnitScale: 1 },
      markets: new Map([
        ["financial_services", { book: "world", referenceUnitPrice: 5, maximumInputUnitPrice: 6 }],
      ]),
      outputMultiplier: 0.4,
      operatingRecipeRatio: 1,
      recessionCapacityFactor: 1,
      labourCost: 10,
      otherOperatingCost: 5,
      labourRecipientAccountId: "households",
      operatingRecipientAccountId: "operating",
    });
    input.production.producers = [prepared.plan];
    input.targets = [prepared.target];
    input.production.accounts = input.production.accounts.map((account) =>
      account.id === "corp" ? { ...account, id: corporationId } : account
    );
    input.bindings = input.bindings.map((binding) =>
      binding.accountId === "corp" ? { ...binding, accountId: corporationId } : binding
    );
    input.production.households = [
      {
        accountId: "households",
        spendFraction: 1,
        products: [
          { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
        ],
      },
    ];
    const result = await settleProducerTurn(db, input);
    expect(result.producers[0]).toMatchObject({
      capacityUnits: 10,
      producedUnits: 4,
      offeredUnits: 4,
      soldUnits: 4,
      revenue: 12,
      profit: -3,
    });
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      liquidCapital: 994,
      bankCharter: { cashReserves: 9000, totalLoans: 6000, totalDeposits: 8000 },
    });
    expect(memory.collection("corporateSectors").docs[0].producerInventory).toMatchObject({
      worldEpoch: "example",
      turn: 1,
    });
  });

  it("rejects unreconciled physical stock before freezing or moving cash", async () => {
    const { memory, input, db } = fixture();
    memory.collection("corporateSectors").docs[0].capitalStock = openingDailyUnits + 1;
    await expect(settleProducerTurn(db, input)).rejects.toThrow("physical opening");
    expect(memory.collection("producerEconomyTurns").docs).toHaveLength(0);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });

  it.each([false, true])(
    "recovers physical delivery and depreciation exactly once, afterWrite=%s",
    async (afterWrite) => {
      const { memory, input, db } = fixture();
      const queue = [
        { unitsOrdered: 24, costPaidAnchor: 12, startTurn: 0, onlineTurn: 1, smooth: true },
      ];
      input.targets = input.targets.map((target) => ({
        ...target,
        capacity: { ...target.capacity, buildQueue: queue },
      }));
      memory.collection("corporateSectors").docs[0].buildQueue = queue;
      const faulty = withInjectedCrash(memory, {
        collection: "corporateSectors",
        op: "bulkWrite",
        onCall: 1,
        afterWrite,
      });
      await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
      const frozenCash = memory.collection("corporations").docs[0].liquidCapital;
      input.targets = [];
      const result = await settleProducerTurn(db, input);
      const expectedDaily = (openingDailyUnits + 24) * (1 - CAPITAL_DEPRECIATION_PER_TURN);
      expect(result.producers[0].capacityUnits).toBe(expectedDaily / TURNS_PER_DAY);
      expect(memory.collection("corporateSectors").docs[0]).toMatchObject({
        capitalStock: expectedDaily,
        capacityBookAnchor: 112 * (1 - CAPITAL_DEPRECIATION_PER_TURN),
        buildQueue: [],
        producerCapacity: { worldEpoch: "example", turn: 1 },
        constructionInProgressAnchor: 0,
      });
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(frozenCash);
      expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
    }
  );

  it("publishes the same delivered receipt that paid cash and preserves bank and user-command fields", async () => {
    const { memory, input, db } = fixture();
    const result = await settleProducerTurn(db, input);
    expect(result.producers[0]).toMatchObject({
      producedUnits: 10,
      deliveredUnits: 10,
      revenue: 30,
      profit: 15,
      cashFlow: 15,
    });
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      liquidCapital: 1030,
      bankCharter: { cashReserves: 9000, totalLoans: 6000, totalDeposits: 8000 },
    });
    expect(memory.collection("corporateSectors").docs[0]).toMatchObject({
      pricingPosture: 0.2,
      producerSettlement: { worldEpoch: "example", turn: 1, revenue: 30 },
    });
    expect(memory.collection("producerEconomyTurns").docs[0].status).toBe("settled");
    expect(await settleProducerTurn(db, input)).toEqual(result);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
  });

  it("conserves observed money and reconciles every real wallet against one durable primary witness", async () => {
    const { memory, input, db } = fixture();
    memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 2 }]);
    memory.seed("gameConfig", [{ _id: "default", moneySupplyEnabled: true }]);
    memory.seed("centralBanks", [{ _id: "US", countryId: "US", externalBroadMoney: 0 }]);
    memory.collection("producerEconomyAccounts").docs.push({
      _id: "stale",
      worldEpoch: "other",
      cash: 1000000,
      currency: "USD",
      kind: "households",
    });
    const opening = await collectBalances(db);
    expect(opening).not.toHaveProperty("economy_wallet:stale:USD");
    await snapshotMoneySupply(db, 0);
    const before = memory.collection("moneySupplySnapshots").docs[0];
    await settleProducerTurn(db, input);
    const closing = await collectBalances(db);
    await snapshotMoneySupply(db, 1);
    const after = memory.collection("moneySupplySnapshots").docs.find((row) => row.turn === 1)!;
    expect(after.m2).toBe(before.m2);
    expect(after.householdLiquid).toBe(60);
    expect(after.corporateLiquid).toBe(1040);
    const entries = await db.collection<LedgerEntry>("ledgerEntries").find({}).toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].legs.every((leg) => leg.role === "primary")).toBe(true);
    expect(
      reconcileLedger({ turn: 1, entries, openingBalances: opening, closingBalances: closing })
        .status
    ).toBe("green");
    await settleProducerTurn(db, input);
    expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
  });

  it.each([false, true])(
    "recovers the cash witness after interruption, afterWrite=%s",
    async (afterWrite) => {
      const { memory, input, db } = fixture();
      const faulty = withInjectedCrash(memory, {
        collection: "ledgerEntries",
        op: "insertOne",
        onCall: 1,
        afterWrite,
      });
      await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
      await settleProducerTurn(db, input);
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
      expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
    }
  );

  it.each([false, true])(
    "recovers publication after cash landed, afterWrite=%s",
    async (afterWrite) => {
      const { memory, input, db } = fixture();
      const faulty = withInjectedCrash(memory, {
        collection: "corporateSectors",
        op: "bulkWrite",
        onCall: 1,
        afterWrite,
      });
      await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
      input.production.producers = input.production.producers.map((p) => ({
        ...p,
        capacityUnits: 1000,
      }));
      const result = await settleProducerTurn(db, input);
      expect(result.producers[0].producedUnits).toBe(10);
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
      expect(memory.collection("corporateSectors").docs[0]).toMatchObject({
        producerSettlement: { producedUnits: 10, revenue: 30 },
      });
    }
  );

  it("recovers the frozen original quote when interrupted before cash", async () => {
    const { memory, input, db } = fixture();
    const faulty = withInjectedCrash(memory, {
      collection: "producerEconomyTurns",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
    input.production.producers = [];
    const result = await settleProducerTurn(db, input);
    expect(result.producers[0].revenue).toBe(30);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1030);
  });

  it("does not move cash when a frozen receipt chunk is missing", async () => {
    const { memory, input, db } = fixture();
    input.production.externalOrders = Array.from({ length: 129 }, (_, i) => ({
      id: `unused:${i}`,
      accountId: "households",
      commodity: "unused",
      book: "world",
      units: 0,
      maximumUnitPrice: 0,
    }));
    const faulty = withInjectedCrash(memory, {
      collection: "producerEconomyTurns",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
    expect(memory.collection("producerEconomyTurnChunks").docs.length).toBeGreaterThan(0);
    memory.collection("producerEconomyTurnChunks").docs.splice(0);
    await expect(settleProducerTurn(db, input)).rejects.toThrow("Missing producer receipt chunk");
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });

  it("carries stored invoices across turns and rejects an omitted opening debt", async () => {
    const { memory, input, db } = fixture();
    memory.collection("corporations").docs[0].liquidCapital = 0;
    input.production.accounts = input.production.accounts.map((account) =>
      account.id === "corp" ? { ...account, cash: 0 } : account
    );
    input.bindings = input.bindings.map((binding) =>
      binding.accountId === "corp" ? { ...binding, openingCashLocal: 0 } : binding
    );
    const first = await settleProducerTurn(db, input);
    // No cash: nothing is staffed, so only the fixed site bill becomes a debt.
    expect(first.producers[0]).toMatchObject({ profit: -5, closingArrears: 5 });
    const stored = (await db
      .collection<Corporation>("corporations")
      .findOne({ _id: new ObjectId(corporationId) }))!.producerPayables!;
    expect(
      stored.claims.reduce((sum: number, claim: { amount: number }) => sum + claim.amount, 0)
    ).toBe(5);
    memory.collection("corporations").docs[0].liquidCapital = 30;
    const household = memory
      .collection("producerEconomyAccounts")
      .docs.find((row) => row._id === "households")!;
    household.cash = Number(household.cash) - 30;
    memory.collection("gameState").docs[0].processingTargetTurn = 2;
    input.production = {
      ...input.production,
      turn: 2,
      accounts: input.production.accounts.map((account) =>
        account.id === "corp"
          ? { ...account, cash: 15 }
          : account.id === "households"
            ? { ...account, cash: 35 }
            : account
      ),
    };
    input.bindings = input.bindings.map((binding) => ({
      ...binding,
      openingCashLocal:
        binding.accountId === "corp" ? 30 : binding.accountId === "households" ? 70 : 0,
    }));
    await expect(settleProducerTurn(db, input)).rejects.toThrow("omitted");
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(30);
    input.production.payables = stored.claims;
    input.production.producers = input.production.producers.map((plan) => ({
      ...plan,
      inputStock: first.producers[0].inputStock,
      outputStock: first.producers[0].outputStock,
    }));
    input.targets = input.targets.map((target) => ({
      ...target,
      capacity: {
        completedTurn: 1,
        ownedDailyUnits: openingDailyUnits * (1 - CAPITAL_DEPRECIATION_PER_TURN),
        paidBookAnchor: 100 * (1 - CAPITAL_DEPRECIATION_PER_TURN),
        buildQueue: [],
      },
    }));
    const second = await settleProducerTurn(db, input);
    // The carried site bill is paid first; what is left staffs part of the
    // run, which sells, so the plant recovers instead of only servicing debt.
    expect(second.producers[0]).toMatchObject({ arrearsPaid: 5, closingArrears: 0 });
    expect(second.producers[0].profit).toBeGreaterThan(0);
    expect(second.producers[0].cashFlow).toBeCloseTo(0, 1);
    expect(memory.collection("corporations").docs[0].producerPayables).toMatchObject({ turn: 2 });
  });

  it.each([false, true])(
    "recovers payable publication without another payment, afterWrite=%s",
    async (afterWrite) => {
      const { memory, input, db } = fixture();
      const claim = {
        debtorAccountId: "corp",
        creditorAccountId: "households",
        producerId: "plant",
        kind: "labour" as const,
        amount: 20,
      };
      const payables = [{ ...claim, id: producerPayableId(claim) }];
      memory.collection("corporations").docs[0].producerPayables = {
        worldEpoch: "example",
        turn: 0,
        claims: payables,
      };
      input.production.payables = payables;
      const faulty = withInjectedCrash(memory, {
        collection: "corporations",
        op: "bulkWrite",
        onCall: 1,
        afterWrite,
      });
      await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(990);
      input.production.payables = [];
      const result = await settleProducerTurn(db, input);
      expect(result.producers[0]).toMatchObject({
        profit: 15,
        cashFlow: -5,
        arrearsPaid: 20,
        closingArrears: 0,
      });
      expect(memory.collection("corporations").docs[0].liquidCapital).toBe(990);
      expect(memory.collection("corporations").docs[0].producerPayables).toMatchObject({
        turn: 1,
        claims: [],
      });
      expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
    }
  );

  it("shows the exact native repayment after the outstanding balance is cleared and FX changes", async () => {
    const { memory, input, db } = fixture();
    const claim = {
      debtorAccountId: "corp",
      creditorAccountId: "households",
      producerId: "plant",
      kind: "labour" as const,
      amount: 20,
    };
    const claims = [{ ...claim, id: producerPayableId(claim) }];
    memory.collection("corporations").docs[0].producerPayables = {
      worldEpoch: "example",
      turn: 0,
      claims,
    };
    input.production.payables = claims;
    await settleProducerTurn(db, input);
    const corporation = (await db
      .collection<Corporation>("corporations")
      .findOne({ _id: new ObjectId(corporationId) }))!;
    expect(corporation.producerPayables?.claims).toEqual([]);
    const view = await loadArrearsView({
      db,
      corporation,
      viewerUserId: corporation.userId!.toString(),
      turn: 1,
      rates: new Map([["USD", 3]]),
    });
    expect(view).toEqual({ turn: 1, paidLastTurn: 40, remaining: 0 });
  });

  it("rejects an unsupported native currency before freezing or moving cash", async () => {
    const { memory, input, db } = fixture();
    input.bindings = input.bindings.map((binding) => ({ ...binding, currency: "unvalued" }));
    await expect(settleProducerTurn(db, input)).rejects.toThrow("native ledger currency");
    expect(memory.collection("producerEconomyTurns").docs).toHaveLength(0);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });

  it("refuses a different turn fence before freezing or moving money", async () => {
    const { memory, input, db } = fixture();
    memory.collection("gameState").docs[0].processingTargetTurn = 2;
    await expect(settleProducerTurn(db, input)).rejects.toThrow("turn fence");
    expect(memory.collection("producerEconomyTurns").docs).toHaveLength(0);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });

  it("settles with the frozen owner after a mid-turn transfer and records a warning", async () => {
    const { memory, input, db } = fixture();
    addSecondCorporation(memory, input, newOwnerId);
    memory.collection("corporateSectors").docs[0].corporationId = new ObjectId(newOwnerId);
    const result = await settleProducerTurn(db, input);
    // Cash, including revenue, wages and costs, stays with the owner the plan froze.
    expect(corporationById(memory, corporationId)).toMatchObject({ liquidCapital: 1030 });
    expect(corporationById(memory, newOwnerId)).toMatchObject({ liquidCapital: 0 });
    // The physical receipt belongs to the sector itself, whatever owns it now.
    expect(memory.collection("corporateSectors").docs[0]).toMatchObject({
      corporationId: new ObjectId(newOwnerId),
      producerSettlement: { worldEpoch: "example", turn: 1, revenue: 30 },
      producerCapacity: { worldEpoch: "example", turn: 1 },
    });
    expect(result.turnWarnings).toHaveLength(1);
    expect(result.turnWarnings![0]).toContain(sectorId);
    expect(result.turnWarnings![0]).toContain(corporationId);
    expect(result.turnWarnings![0]).toContain(newOwnerId);
  });

  it("replays a settled turn with drifted ownership exactly once", async () => {
    const { memory, input, db } = fixture();
    addSecondCorporation(memory, input, newOwnerId);
    memory.collection("corporateSectors").docs[0].corporationId = new ObjectId(newOwnerId);
    const result = await settleProducerTurn(db, input);
    expect(await settleProducerTurn(db, input)).toEqual(result);
    expect(corporationById(memory, corporationId)).toMatchObject({ liquidCapital: 1030 });
    expect(corporationById(memory, newOwnerId)).toMatchObject({ liquidCapital: 0 });
    expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
  });

  it("still refuses when the sector is gone", async () => {
    const { memory, input, db } = fixture();
    memory.collection("corporateSectors").docs.splice(0);
    await expect(settleProducerTurn(db, input)).rejects.toThrow("is missing");
    expect(memory.collection("producerEconomyTurns").docs).toHaveLength(0);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
  });

  it("books a dissolved frozen owner's cash to the sector's current owner", async () => {
    const { memory, input, db } = fixture();
    addSecondCorporation(memory, input, newOwnerId);
    const faulty = withInjectedCrash(memory, {
      collection: "producerEconomyTurns",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
    expect(corporationById(memory, corporationId)).toMatchObject({ liquidCapital: 1000 });
    // The frozen owner disappears after the plan froze and the sector moved on.
    memory.collection("corporations").docs.splice(
      memory
        .collection("corporations")
        .docs.findIndex((corp) => (corp._id as ObjectId).toHexString() === corporationId),
      1
    );
    memory.collection("corporateSectors").docs[0].corporationId = new ObjectId(newOwnerId);
    const result = await settleProducerTurn(db, input);
    expect(corporationById(memory, corporationId)).toBeUndefined();
    expect(corporationById(memory, newOwnerId)).toMatchObject({ liquidCapital: 30 });
    expect(memory.collection("corporateSectors").docs[0]).toMatchObject({
      producerSettlement: { worldEpoch: "example", turn: 1, revenue: 30 },
    });
    expect(result.turnWarnings).toHaveLength(1);
    expect(result.turnWarnings![0]).toContain(corporationId);
    expect(result.turnWarnings![0]).toContain(newOwnerId);
  });

  it("refuses a dissolved frozen owner whose cash has nowhere to go", async () => {
    const { memory, input, db } = fixture();
    const faulty = withInjectedCrash(memory, {
      collection: "producerEconomyTurns",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(settleProducerTurn(faulty.db, input)).rejects.toThrow("crash");
    memory.collection("corporations").docs.splice(
      memory
        .collection("corporations")
        .docs.findIndex((corp) => (corp._id as ObjectId).toHexString() === corporationId),
      1
    );
    memory.collection("corporateSectors").docs[0].corporationId = new ObjectId(thirdOwnerId);
    await expect(settleProducerTurn(db, input)).rejects.toThrow("nowhere to book its cash");
    expect(memory.collection("ledgerEntries").docs).toHaveLength(0);
  });
});
