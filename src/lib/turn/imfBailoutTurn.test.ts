vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CorpSnapshot } from "./corporation/types";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";

vi.mock("@/lib/imf/resolveImfCorporation", () => ({ getImfCorporation: vi.fn() }));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn(),
}));
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { processImfBailoutPayments } from "./imfBailoutTurn";
let memory: InMemoryDb;
const borrowerId = new ObjectId(),
  lenderId = new ObjectId();
let borrower: Corporation, lender: Corporation;
const snapshots = () =>
  [
    { corpId: borrowerId, income: 2000, liquidCapital: 3000 },
    { corpId: lenderId, income: 0, liquidCapital: 10000 },
  ] as CorpSnapshot[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isForexEnabled).mockResolvedValue(true);
  memory = createInMemoryDb();
  borrower = {
    _id: borrowerId,
    name: "Borrower",
    countryId: "CA",
    liquidCurrencyCode: "CAD",
    liquidCapital: 3000,
    imfBailoutActive: true,
    imfFacilityPrincipalOutstanding: 1000,
    imfFacilityAnnualRate: 0,
    imfFacilityAmortizationTurnsRemaining: 2,
  } as Corporation;
  lender = {
    _id: lenderId,
    name: "IMF",
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 10000,
  } as Corporation;
  memory.seed("corporations", [borrower, lender] as unknown as Record<string, unknown>[]);
  vi.mocked(getImfCorporation).mockResolvedValue(lender);
  vi.mocked(loadFxRatesByCurrency).mockResolvedValue(
    new Map([
      ["CAD", 2],
      ["USD", 1],
    ])
  );
});
const run = (db: Db = memory as unknown as Db, corps = [borrower, lender]) =>
  processImfBailoutPayments(db, 12, snapshots(), corps);
it("pays equal anchor value, advances anchor principal, and replays without another debit", async () => {
  const snaps = snapshots();
  await processImfBailoutPayments(memory as unknown as Db, 12, snaps, [borrower, lender]);
  expect(memory.collection("corporations").docs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: borrowerId,
        liquidCapital: 2000,
        imfFacilityPrincipalOutstanding: 500,
      }),
      expect.objectContaining({ _id: lenderId, liquidCapital: 10500 }),
    ])
  );
  expect(snaps[0].liquidCapital).toBe(2000);
  await run();
  await run();
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(2000);
  expect(memory.collection("financialTxLog").docs).toHaveLength(1);
});
it.each(
  [false, true].flatMap((afterWrite) =>
    Array.from({ length: 14 }, (_, i) => i + 1).map((onCall) => ({ afterWrite, onCall }))
  )
)(
  "resumes a frozen payment across write $onCall (after=$afterWrite)",
  async ({ afterWrite, onCall }) => {
    const fault = withInjectedCrash(memory, { onCall, afterWrite });
    try {
      await run(fault.db);
    } catch {
      /* Process boundary. */
    }
    fault.disarm();
    const fresh = memory.collection("corporations").docs as unknown as Corporation[];
    await run(memory as unknown as Db, fresh);
    await run(memory as unknown as Db, fresh);
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      liquidCapital: 2000,
      imfFacilityPrincipalOutstanding: 500,
    });
    expect(memory.collection("corporations").docs[1].liquidCapital).toBe(10500);
    expect(memory.collection("financialTxLog").docs).toHaveLength(1);
  }
);
it("defers an unavailable currency without changing debt or blocking other turn work", async () => {
  vi.mocked(loadFxRatesByCurrency).mockResolvedValue(new Map([["USD", 1]]));
  expect(await run()).toEqual({ paymentsApplied: 0 });
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 3000,
    imfFacilityPrincipalOutstanding: 1000,
  });
  expect(memory.collection("bankMoneyMoves").docs).toHaveLength(0);
});
it("caps servicing by available cash instead of refusing the turn", async () => {
  await memory
    .collection("corporations")
    .updateOne({ _id: borrowerId }, { $set: { liquidCapital: 100 } });
  const snaps = snapshots();
  snaps[0].liquidCapital = 100;
  await processImfBailoutPayments(memory as unknown as Db, 12, snaps, [borrower, lender]);
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 0,
    imfFacilityPrincipalOutstanding: 950,
  });
});

it("resumes frozen payments without consulting a replacement FX quote", async () => {
  const fault = withInjectedCrash(memory, {
    collection: "corporations",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  try {
    await run(fault.db);
  } catch {
    /* Simulate process interruption. */
  }
  fault.disarm();
  vi.mocked(loadFxRatesByCurrency).mockResolvedValue(new Map());
  await run();
  await run();
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 2000,
    imfFacilityPrincipalOutstanding: 500,
  });
  expect(memory.collection("corporations").docs[1].liquidCapital).toBe(10500);
});

it("does no facility work for an ordinary turn without borrowers", async () => {
  expect(await processImfBailoutPayments(memory as unknown as Db, 12, snapshots(), [])).toEqual({
    paymentsApplied: 0,
  });
  expect(getImfCorporation).not.toHaveBeenCalled();
});
it("services anchor cash when forex is disabled without requiring exchange rates", async () => {
  vi.mocked(isForexEnabled).mockResolvedValue(false);
  vi.mocked(loadFxRatesByCurrency).mockResolvedValue(new Map());
  await run();
  await run();
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 2500,
    imfFacilityPrincipalOutstanding: 500,
  });
  expect(memory.collection("corporations").docs[1].liquidCapital).toBe(10500);
});
it("journals an unfunded interest accrual without moving cash or repeating the accrual", async () => {
  borrower.imfFacilityAnnualRate = 12;
  memory.seed("corporations", [borrower, lender] as unknown as Record<string, unknown>[]);
  const snaps = snapshots();
  snaps[0].income = 0;
  await processImfBailoutPayments(memory as unknown as Db, 12, snaps, [borrower, lender]);
  const principal = memory.collection("corporations").docs[0].imfFacilityPrincipalOutstanding;
  expect(principal).toBeGreaterThan(1000);
  await run();
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 3000,
    imfFacilityPrincipalOutstanding: principal,
  });
});
