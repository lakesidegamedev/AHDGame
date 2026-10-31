import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { makeCorporation } from "@/lib/test-utils/factories";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { CAPITAL_DEPRECIATION_PER_TURN } from "@/lib/market/capital";
import { applyMoneyMove } from "@/lib/banking/moneyMove";
import {
  closeTransferMoves,
  PRODUCER_ACCOUNTS,
  type CloseParty,
} from "@/lib/market/producerMarket/liveFundingRules";
import { prepareProducerSector } from "./producerSectorPlan";
import {
  producerWalletId,
  runCorporationProducerMarket,
  type ProducerWalletScope,
} from "./producerMarketPhase";
import { planFundedClose, readProducerOpeningTurn } from "./fundedProducerTurn";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const RATE = 2;

function world(targetTurn = 1) {
  const memory = createInMemoryDb();
  const corp = makeCorporation({
    liquidCapital: 1000,
    liquidCurrencyCode: "USD",
    ceoType: "npp",
    producerPayables: { worldEpoch: "world", turn: 0, claims: [] },
  });
  const scopes: ProducerWalletScope[] = [
    { kind: "households", countryId: "US", stateId: "US_CA", currency: "USD" },
    { kind: "operatingPayee", countryId: "US", stateId: "US_CA", currency: "USD" },
  ];
  const household = producerWalletId("world", scopes[0]);
  const operating = producerWalletId("world", scopes[1]);
  const sector = {
    _id: new ObjectId(),
    corporationId: corp._id,
    sectorType: "financial" as const,
    capitalStock: (10 * TURNS_PER_DAY) / (1 - CAPITAL_DEPRECIATION_PER_TURN),
    capacityBookAnchor: 100,
    buildQueue: [],
    producerCapacity: { worldEpoch: "world", turn: 0 },
    producerInventory: { worldEpoch: "world", turn: 0, inputStock: [], outputStock: [] },
    producerQuotes: { financial_services: { kind: "manual" as const, unitPrice: 3 } },
  };
  memory.seed("gameState", [
    {
      _id: "current",
      worldEpochId: "world",
      isActive: true,
      processingKind: "turn",
      isProcessing: true,
      processingTargetTurn: targetTurn,
    },
  ]);
  memory.seed("corporations", [{ ...corp }]);
  memory.seed("corporateSectors", [sector]);
  // Households hold savings, so the plant sells and makes a profit to distribute.
  memory.seed(PRODUCER_ACCOUNTS, [
    { _id: household, worldEpoch: "world", ...scopes[0], cash: 200 },
  ]);
  return { memory, corp, sector, scopes, household, operating, db: memory as unknown as Db };
}

const totalAnchor = (memory: ReturnType<typeof createInMemoryDb>) =>
  memory.collection("corporations").docs.reduce((s, c) => s + (c.liquidCapital as number), 0) /
    RATE +
  memory.collection(PRODUCER_ACCOUNTS).docs.reduce((s, w) => s + (w.cash as number), 0) / RATE;

describe("funded producer turn close", () => {
  it("conserves money through settlement, AI profit distribution and the operating sweep", async () => {
    const { memory, corp, sector, scopes, household, operating, db } = world();
    const before = totalAnchor(memory);
    const settled = await runCorporationProducerMarket(db, {
      worldEpoch: "world",
      turn: 1,
      corporations: [corp],
      walletScopes: scopes,
      rates: new Map([["USD", RATE]]),
      prepare: () => [
        prepareProducerSector({
          worldEpoch: "world",
          turn: 1,
          sector,
          recipe: { supply: { financial_services: 1 }, demand: {}, eraUnitScale: 1 },
          markets: new Map([
            [
              "financial_services",
              { book: "world", referenceUnitPrice: 3, maximumInputUnitPrice: 4 },
            ],
          ]),
          outputMultiplier: 1,
          operatingRecipeRatio: 1,
          recessionCapacityFactor: 1,
          labourCost: 10,
          otherOperatingCost: 5,
          labourRecipientAccountId: household,
          operatingRecipientAccountId: operating,
        }),
      ],
      demand: {
        households: [
          {
            accountId: household,
            spendFraction: 1,
            products: [
              { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
            ],
          },
        ],
      },
    });
    expect(totalAnchor(memory)).toBeCloseTo(before);

    const corpId = corp._id.toHexString();
    const profit = settled.operatingByCorporation.get(corpId)!.profit;
    expect(profit).toBeGreaterThan(0);
    const closingCash = new Map(settled.result.accounts.map((a) => [a.id, a.cash]));
    const party = (collection: string, id: string, path: string): CloseParty => ({
      collection,
      filter: { _id: collection === "corporations" ? new ObjectId(id) : id },
      path,
      id,
      currencyCode: "USD",
      localPerAnchor: RATE,
    });
    const transfers = planFundedClose({
      settledProfitByCorp: new Map([[corpId, profit]]),
      closingCash,
      ownerKindByCompany: new Map([[corpId, "ai"]]),
      householdFor: () => household,
      householdForPayee: new Map([[operating, household]]),
      corpParty: (id) => party("corporations", id, "liquidCapital"),
      walletParty: (id) => party(PRODUCER_ACCOUNTS, id, "cash"),
    });
    expect(transfers.map((t) => t.reason).sort()).toEqual(["ai_dividend", "operating_income"]);
    expect(transfers.find((t) => t.reason === "ai_dividend")!.amountAnchor).toBeCloseTo(
      profit * 0.6
    );

    for (const move of closeTransferMoves("world", 1, transfers)) {
      const r = await applyMoneyMove(db, move);
      expect(["applied", "replayed"]).toContain(r.status);
    }
    expect(totalAnchor(memory)).toBeCloseTo(before);
    const payee = memory.collection(PRODUCER_ACCOUNTS).docs.find((w) => w._id === operating);
    expect(payee?.cash ?? 0).toBeCloseTo(0);

    // A retried close changes nothing.
    for (const move of closeTransferMoves("world", 1, transfers)) await applyMoneyMove(db, move);
    expect(totalAnchor(memory)).toBeCloseTo(before);
  });
});

const prepareAt = (
  sector: Parameters<typeof prepareProducerSector>[0]["sector"],
  household: string,
  operating: string,
  turn: number,
  openingTurn?: number
) =>
  prepareProducerSector({
    worldEpoch: "world",
    turn,
    openingTurn,
    sector,
    recipe: { supply: { financial_services: 1 }, demand: {}, eraUnitScale: 1 },
    markets: new Map([
      ["financial_services", { book: "world", referenceUnitPrice: 3, maximumInputUnitPrice: 4 }],
    ]),
    outputMultiplier: 1,
    operatingRecipeRatio: 1,
    recessionCapacityFactor: 1,
    labourCost: 10,
    otherOperatingCost: 5,
    labourRecipientAccountId: household,
    operatingRecipientAccountId: operating,
  });

describe("funded producer turn after a missed economy step", () => {
  // Turn 1's economy step failed before freezing: plants still open at 0, a
  // company founded since was admitted at 1, and turn 2 must run.
  it("settles lagging plants and new entrants together, conserving money across a replay", async () => {
    const { memory, corp, sector, scopes, household, operating, db } = world(2);
    const entrant = {
      ...sector,
      _id: new ObjectId(),
      capitalStock: 0,
      capacityBookAnchor: 0,
      buildQueue: [
        { unitsOrdered: 12, costPaidAnchor: 6, startTurn: 1, onlineTurn: 4, smooth: true },
      ],
      producerCapacity: { worldEpoch: "world", turn: 1 },
      producerInventory: { worldEpoch: "world", turn: 1, inputStock: [], outputStock: [] },
    };
    memory.seed("corporateSectors", [entrant]);
    memory.seed("producerEconomyTurns", [
      { _id: JSON.stringify(["world", 0]), worldEpoch: "world", turn: 0, status: "settled" },
    ]);
    const openingTurn = await readProducerOpeningTurn(db, "world", 2);
    expect(openingTurn).toBe(0);
    // Without the opening turn the lagging plant is refused, as before.
    expect(() => prepareAt(sector, household, operating, 2)).toThrow(
      "reconciled opening generation"
    );
    const before = totalAnchor(memory);
    const run = () =>
      runCorporationProducerMarket(db, {
        worldEpoch: "world",
        turn: 2,
        corporations: [corp],
        walletScopes: scopes,
        rates: new Map([["USD", RATE]]),
        prepare: () => [
          prepareAt(sector, household, operating, 2, openingTurn),
          prepareAt(entrant, household, operating, 2, openingTurn),
        ],
        demand: {
          households: [
            {
              accountId: household,
              spendFraction: 1,
              products: [
                { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
              ],
            },
          ],
        },
      });
    const settled = await run();
    expect(settled.operatingByCorporation.get(corp._id.toHexString())!.profit).toBeGreaterThan(0);
    expect(totalAnchor(memory)).toBeCloseTo(before);
    const docs = memory.collection("corporateSectors").docs;
    for (const doc of docs) {
      expect(doc.producerCapacity).toEqual({ worldEpoch: "world", turn: 2 });
      expect((doc.producerInventory as { turn: number }).turn).toBe(2);
      expect((doc.producerSettlement as { turn: number }).turn).toBe(2);
    }
    // Two turns of wear on the lagging plant; the entrant's construction landed.
    const lagging = docs.find((d) => String(d._id) === sector._id.toHexString())!;
    expect(lagging.capitalStock).toBeCloseTo(
      sector.capitalStock * (1 - CAPITAL_DEPRECIATION_PER_TURN) ** 2
    );
    const landed = docs.find((d) => String(d._id) === entrant._id.toHexString())!;
    expect(landed.capitalStock).toBeCloseTo(4 * (1 - CAPITAL_DEPRECIATION_PER_TURN));
    const record = memory
      .collection("producerEconomyTurns")
      .docs.find((d) => d._id === JSON.stringify(["world", 2]));
    expect(record?.status).toBe("settled");

    // A crashed and retried turn replays the frozen settlement and moves nothing.
    const cash = memory.collection("corporations").docs.map((c) => c.liquidCapital);
    await run();
    expect(memory.collection("corporations").docs.map((c) => c.liquidCapital)).toEqual(cash);
    expect(totalAnchor(memory)).toBeCloseTo(before);
  });

  it("fails closed on half-published, future and too-old openings", async () => {
    const { memory, sector, household, operating, db } = world(2);
    // A plant behind the last settled turn missed its publication.
    expect(() => prepareAt(sector, household, operating, 3, 1)).toThrow(
      "reconciled opening generation"
    );
    // A generation from the future.
    expect(() =>
      prepareAt(
        {
          ...sector,
          producerCapacity: { worldEpoch: "world", turn: 2 },
          producerInventory: { worldEpoch: "world", turn: 2, inputStock: [], outputStock: [] },
        },
        household,
        operating,
        2,
        0
      )
    ).toThrow("reconciled opening generation");
    // Capacity and stock from different generations.
    expect(() =>
      prepareAt(
        {
          ...sector,
          producerInventory: { worldEpoch: "world", turn: 1, inputStock: [], outputStock: [] },
        },
        household,
        operating,
        2,
        0
      )
    ).toThrow("reconciled opening generation");
    // Another world's generation.
    expect(() =>
      prepareAt(
        {
          ...sector,
          producerCapacity: { worldEpoch: "old", turn: 0 },
          producerInventory: { worldEpoch: "old", turn: 0, inputStock: [], outputStock: [] },
        },
        household,
        operating,
        2,
        0
      )
    ).toThrow("reconciled opening generation");
    // An opening further back than the catch-up bound.
    expect(() => prepareAt(sector, household, operating, 20, 0)).toThrow(
      "reconciled opening generation"
    );

    // No funded turn yet: the previous turn is the opening.
    expect(await readProducerOpeningTurn(db, "world", 2)).toBe(1);
    memory.seed("producerEconomyTurns", [
      { _id: JSON.stringify(["world", 0]), worldEpoch: "world", turn: 0, status: "frozen" },
      { _id: JSON.stringify(["other", 1]), worldEpoch: "other", turn: 1, status: "settled" },
    ]);
    await expect(readProducerOpeningTurn(db, "world", 2)).rejects.toThrow("never settled");
    memory.seed("producerEconomyTurns", [
      { _id: JSON.stringify(["world", 1]), worldEpoch: "world", turn: 1, status: "settled" },
    ]);
    expect(await readProducerOpeningTurn(db, "world", 2)).toBe(1);
    await expect(readProducerOpeningTurn(db, "world", 9)).rejects.toThrow("more than 6 turns");
  });
});
