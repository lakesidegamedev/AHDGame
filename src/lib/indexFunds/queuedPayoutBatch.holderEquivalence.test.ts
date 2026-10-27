/**
 * A queued payout book settles the same way whether it is paid as one batch or
 * one claim at a time (#4571).
 *
 * Characters, imperial characters and NPPs used to settle their queued
 * redemptions one durable money move each, at about 20 round trips per claim,
 * while NPP claims already shared one batch. Paying the whole fund in one move
 * must leave every balance, unit count, queue row and receipt exactly where the
 * one-at-a-time path left them, including the anchor-to-native conversion.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { processQueuedRedemptions } from "./fundCron";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const batchMode = vi.hoisted(() => ({ enabled: true }));
// The one-at-a-time path is the code this change replaces, so switching the
// batch off here is a straight A/B of the two settlements.
vi.mock("./queuedPayoutBatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./queuedPayoutBatch")>();
  return {
    ...actual,
    isBatchablePayout: (entry: Parameters<typeof actual.isBatchablePayout>[0]) =>
      batchMode.enabled && actual.isBatchablePayout(entry),
  };
});

const T0 = new Date("2000-01-01T00:00:00Z");
const TURN = 40;
/** Fixed ids so two worlds can be compared document for document. */
function oid(index: number): ObjectId {
  return new ObjectId(`aaaaaaaaaaaaaaaaaaaa${String(index).padStart(4, "0")}`);
}

type EntrySpec =
  | { holder: "character"; id: ObjectId; units: number; rate?: number; partialPaid?: number }
  | { holder: "imperial"; id: ObjectId; units: number; rate?: number; partialPaid?: number }
  | { holder: "npp"; id: ObjectId; units: number };

/**
 * One fund, one turn: a character holding two queue rows, an imperial
 * character, an NPP, and one row that was partly paid before it was queued.
 */
function world(options: { currency: "USD" | "GBP"; navy?: number } = { currency: "USD" }) {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const fundId = oid(1);
  const fund: IndexFund = {
    _id: fundId,
    slug: "batch-equivalence",
    name: "Batch Equivalence Fund",
    tickerSymbol: "BEF",
    scope: "country",
    kind: "broad",
    countryId: options.currency === "USD" ? "US" : "UK",
    anchorCurrencyCode: options.currency,
    status: "active",
    quotedNav: options.navy ?? 100,
    unitSupply: 10_000,
    reserveUnits: 0,
    cashAnchor: 40_000,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  } as IndexFund;
  const characterId = oid(2);
  const secondCharacterId = oid(3);
  const imperialId = oid(4);
  const nppId = oid(5);
  const characters = [
    { _id: characterId, name: "Holder One", currencyBalances: { personal: { USD: 0, GBP: 0 } } },
    {
      _id: secondCharacterId,
      name: "Holder Two",
      currencyBalances: { personal: { USD: 0, GBP: 0 } },
    },
  ];
  const imperialCharacters = [
    { _id: imperialId, name: "Imperial One", currencyBalances: { personal: { USD: 0, GBP: 0 } } },
  ];
  const npps = [{ _id: nppId, countryId: "US", name: "NPP One", nppInvestmentCashAnchor: 0 }];

  const specs: EntrySpec[] = [
    { holder: "character", id: characterId, units: 10 },
    { holder: "character", id: characterId, units: 5 },
    ...(options.currency === "GBP"
      ? [{ holder: "character" as const, id: secondCharacterId, units: 10, rate: 0.79 }]
      : [{ holder: "character" as const, id: secondCharacterId, units: 10 }]),
    { holder: "imperial", id: imperialId, units: 8 },
    { holder: "npp", id: nppId, units: 12 },
  ];
  const queue = specs.map((spec, index) => {
    const base = {
      _id: oid(10 + index),
      fundId,
      units: spec.units,
      requestedNavAnchor: 100,
      requestedAmountAnchor: spec.units * 100,
      paidAmountAnchor: 0,
      status: "queued" as const,
      unitsBurnedAtRequest: true,
      createdAt: new Date(T0.getTime() + index),
      updatedAt: new Date(T0.getTime() + index),
    };
    if (spec.holder === "npp") return { ...base, holderKind: "npp", nppId: spec.id };
    if (spec.holder === "imperial")
      return {
        ...base,
        holderKind: "imperial_character",
        imperialCharacterId: spec.id,
        ...("rate" in spec && spec.rate !== undefined ? { redeemFxRate: spec.rate } : {}),
      };
    return {
      ...base,
      holderKind: "character",
      characterId: spec.id,
      ...("rate" in spec && spec.rate !== undefined ? { redeemFxRate: spec.rate } : {}),
    };
  }) as IndexFundRedemptionQueueEntry[];

  memory.seed("indexFunds", [{ ...fund }]);
  memory.seed(
    "indexFundRedemptionQueue",
    queue.map((entry) => ({ ...entry }))
  );
  memory.seed("characters", characters);
  memory.seed("imperialCharacters", imperialCharacters);
  memory.seed("npps", npps);
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true, auditLog: true }]);
  memory.seed("gameState", [{ _id: "current", currentTurn: TURN - 1 }]);
  memory.seed("exchangeRates", [
    { currencyCode: "USD", rate: 1 },
    { currencyCode: "GBP", rate: 0.79 },
  ]);
  return {
    memory,
    db,
    fund,
    fundId,
    queue,
    characterId,
    secondCharacterId,
    imperialId,
    nppId,
  };
}

async function pay(w: ReturnType<typeof world>, turn = TURN) {
  const fund = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
  return processQueuedRedemptions(w.db, fund!, true, turn);
}

/** Every observable that must survive the settlement unchanged. */
async function snapshot(w: ReturnType<typeof world>) {
  const fund = await w.db.collection("indexFunds").findOne({ _id: w.fundId });
  const queue = await w.db
    .collection("indexFundRedemptionQueue")
    .find({})
    .sort({ createdAt: 1 })
    .toArray();
  const holders = [
    ...(await w.db.collection("characters").find({}).sort({ name: 1 }).toArray()),
    ...(await w.db.collection("imperialCharacters").find({}).sort({ name: 1 }).toArray()),
    ...(await w.db.collection("npps").find({}).sort({ name: 1 }).toArray()),
  ].map((row) => ({
    name: row.name,
    ...(row.currencyBalances ? { balances: row.currencyBalances } : {}),
    ...(row.nppInvestmentCashAnchor !== undefined ? { nppCash: row.nppInvestmentCashAnchor } : {}),
  }));
  const receipts = w.memory
    .collection("indexFundTransactions")
    .docs.map((row) => ({
      holderKind: row.holderKind,
      units: row.units,
      amountAnchor: row.amountAnchor,
      characterId: row.characterId ? String(row.characterId) : undefined,
      imperialCharacterId: row.imperialCharacterId ? String(row.imperialCharacterId) : undefined,
      nppId: row.nppId ? String(row.nppId) : undefined,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const witnesses = w.memory
    .collection("financialTxLog")
    .docs.map((row) => ({
      type: row.type,
      subjectId: String(row.subjectId),
      amount: row.amount,
      anchorAmount: row.anchorAmount,
      currencyCode: row.currencyCode,
      units: (row.meta as Record<string, unknown>).units,
      queuedRemainder: (row.meta as Record<string, unknown>).queuedRemainder,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    cashAnchor: fund!.cashAnchor,
    unitSupply: fund!.unitSupply,
    quotedNav: fund!.quotedNav,
    queue: queue.map((row) => ({
      status: row.status,
      units: row.units,
      paidAmountAnchor: row.paidAmountAnchor,
      requestedAmountAnchor: row.requestedAmountAnchor,
    })),
    holders,
    receipts,
    witnesses,
    ledgerRows: w.memory.collection("ledgerEntries").docs.length,
    auditRows: w.memory.collection("actionAuditLog").docs.length,
  };
}

describe("queued payout batch equivalence", () => {
  it("settles a mixed holder book in one money move", async () => {
    const w = world();
    expect(await pay(w)).toBe(5);

    const moves = w.memory
      .collection(MONEY_MOVE_COLLECTION)
      .docs.filter((row) => String(row._id).startsWith("fund-redemption-batch:"));
    expect(moves).toHaveLength(1);
    const legs = moves[0].legs as { kind: string; collection?: string; amount: number }[];
    expect(legs[0]).toMatchObject({ kind: "debit", collection: "indexFunds", amount: 4_500 });
    // One credit per distinct holder, whatever the holder kind.
    expect(legs.filter((leg) => leg.kind === "credit")).toHaveLength(4);
    expect(legs.some((leg) => leg.kind === "burn" || leg.kind === "mint")).toBe(false);
    expect(w.memory.collection("indexFundTransactions").docs).toHaveLength(5);
  });

  it("leaves the world exactly as the one-claim-at-a-time path left it", async () => {
    const batched = world();
    batchMode.enabled = true;
    expect(await pay(batched)).toBe(5);

    const single = world();
    batchMode.enabled = false;
    try {
      expect(await pay(single)).toBe(5);
    } finally {
      batchMode.enabled = true;
    }

    expect(await snapshot(batched)).toEqual(await snapshot(single));
    // The single path really did settle one claim at a time.
    expect(
      single.memory
        .collection(MONEY_MOVE_COLLECTION)
        .docs.filter((row) => String(row._id).startsWith("fund-redemption:"))
    ).toHaveLength(5);
  });

  it("converts to the wallet currency the same way either way", async () => {
    const batched = world({ currency: "GBP" });
    batchMode.enabled = true;
    expect(await pay(batched)).toBe(5);
    const single = world({ currency: "GBP" });
    batchMode.enabled = false;
    try {
      expect(await pay(single)).toBe(5);
    } finally {
      batchMode.enabled = true;
    }
    expect(await snapshot(batched)).toEqual(await snapshot(single));

    // One anchor side and one native side for the whole book, replacing the
    // burn and mint pair each converted claim used to state for itself.
    const move = batched.memory
      .collection(MONEY_MOVE_COLLECTION)
      .docs.find((row) => String(row._id).startsWith("fund-redemption-batch:"))!;
    const legs = move.legs as { kind: string; amount: number }[];
    const credited = legs.filter((leg) => leg.kind === "credit").reduce((s, l) => s + l.amount, 0);
    expect(legs.filter((leg) => leg.kind === "burn")).toHaveLength(1);
    expect(legs.filter((leg) => leg.kind === "mint")).toHaveLength(1);
    expect(legs.find((leg) => leg.kind === "burn")!.amount).toBe(4_500);
    expect(legs.find((leg) => leg.kind === "mint")!.amount).toBe(credited);
    // The converted holder was credited in pounds, the rest in dollars.
    const second = await batched.db
      .collection("characters")
      .findOne({ _id: batched.secondCharacterId });
    const balances = second!.currencyBalances as { personal: Record<string, number> };
    expect(balances.personal.GBP).toBeCloseTo(1_000 * 0.79, 6);
    expect(balances.personal.USD).toBeCloseTo(0, 6);
  });

  it("pays a large character book through one receipt", async () => {
    const w = world();
    batchMode.enabled = true;
    w.memory.collection("indexFundRedemptionQueue").docs.length = 0;
    const holders = Array.from({ length: 120 }, (_, index) => ({
      _id: oid(200 + index),
      name: `Holder ${index}`,
      currencyBalances: { personal: { USD: 0, GBP: 0 } },
    }));
    w.memory.seed("characters", holders);
    w.memory.seed(
      "indexFundRedemptionQueue",
      holders.map((holder, index) => ({
        _id: oid(400 + index),
        fundId: w.fundId,
        holderKind: "character",
        characterId: holder._id,
        units: 10,
        requestedNavAnchor: 100,
        requestedAmountAnchor: 1000,
        paidAmountAnchor: 0,
        status: "queued",
        unitsBurnedAtRequest: true,
        createdAt: new Date(T0.getTime() + index),
        updatedAt: new Date(T0.getTime() + index),
      })) as never
    );
    // Fund cash has to cover the whole book: 120 holders at 10 units and NAV 100.
    w.memory.collection("indexFunds").docs[0].cashAnchor = 200_000;
    const trips = countRoundTrips(w.memory);
    expect(await pay(w)).toBe(120);
    expect(
      w.memory
        .collection(MONEY_MOVE_COLLECTION)
        .docs.filter((row) => String(row._id).startsWith("fund-redemption-batch:"))
    ).toHaveLength(1);
    // One claim fence per entry and a fixed cost per batch: settling each claim
    // through its own money move cost about twenty round trips apiece.
    expect(trips.count("indexFundRedemptionQueue", "findOneAndUpdate")).toBe(120);
    expect(trips.total(), trips.summary()).toBeLessThan(120 + 40);
  });

  it("finishes the book once when the fund debit's acknowledgement is lost", async () => {
    const w = world();
    batchMode.enabled = true;
    const funds = w.memory.collection("indexFunds");
    const updateOne = funds.updateOne.bind(funds);
    let interrupted = false;
    funds.updateOne = async (...args: Parameters<typeof updateOne>) => {
      const result = await updateOne(...args);
      const change = args[1] as { $inc?: Record<string, number> };
      if (!interrupted && change.$inc?.cashAnchor) {
        interrupted = true;
        throw new Error("Synthetic acknowledgement lost");
      }
      return result;
    };
    await pay(w).catch(() => undefined);
    expect(interrupted).toBe(true);

    for (let retry = 0; retry < 3; retry++) await pay(w, TURN + 1 + retry);

    const fund = await w.db.collection("indexFunds").findOne({ _id: w.fundId });
    const queue = await w.db.collection("indexFundRedemptionQueue").find({}).toArray();
    expect(fund!.cashAnchor).toBe(40_000 - 4_500);
    expect(queue.every((row) => row.status === "paid" && row.units === 0)).toBe(true);
    expect(queue.reduce((sum, row) => sum + (row.paidAmountAnchor as number), 0)).toBe(4_500);
    expect(w.memory.collection("indexFundTransactions").docs).toHaveLength(5);
    expect(w.memory.collection("financialTxLog").docs).toHaveLength(5);
  });
});
