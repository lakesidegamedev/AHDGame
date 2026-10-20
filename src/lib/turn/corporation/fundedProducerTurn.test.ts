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
import { planFundedClose } from "./fundedProducerTurn";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const RATE = 2;

function world() {
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
      processingTargetTurn: 1,
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
