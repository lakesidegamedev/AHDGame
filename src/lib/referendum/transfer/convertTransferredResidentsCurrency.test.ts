vi.mock("@/lib/savings/redenominateTransferredSavings", () => ({
  redenominateTransferredSavings: vi.fn().mockResolvedValue(undefined),
}));
import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/currency/corporationCapital", () => ({
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(
    new Map([
      ["GBP", 0.5],
      ["IEP", 1.0],
    ])
  ),
}));
vi.mock("@/lib/corporations/convertCorpCurrency", () => ({
  convertCorpCurrency: vi.fn().mockResolvedValue({ ok: true, converted: true }),
}));
vi.mock("@/lib/savings/closeCharacterSavings", () => ({
  closeCharacterSavings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/savings/accountsShell", () => ({
  ensureSavingsAccount: vi.fn().mockResolvedValue({ id: "acct" }),
}));
vi.mock("@/lib/banking/policy", () => ({
  loadBankingPolicy: vi.fn().mockResolvedValue({ savingsAccounts: "authoritative" }),
}));
vi.mock("@/lib/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(816) }));

const { convertTransferredResidentsCurrency } =
  await import("./convertTransferredResidentsCurrency");
const { convertCorpCurrency } = await import("@/lib/corporations/convertCorpCurrency");
const { isForexEnabled } = await import("@/lib/currency/featureFlag");

function cursorOf<T>(docs: T[]) {
  const c = { project: vi.fn(() => c), toArray: vi.fn().mockResolvedValue(docs) };
  return c;
}

describe("convertTransferredResidentsCurrency", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("re-denominates corps + resident players from GBP to IEP at the FX scale", async () => {
    // scale = toRate/fromRate = IEP(1.0)/GBP(0.5) = 2
    db.collection("corporations").find.mockReturnValue(
      cursorOf([{ _id: "c1", headquartersState: "NIR", countryId: "IE" }])
    );

    await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");

    expect(convertCorpCurrency).toHaveBeenCalledTimes(1);
    expect(vi.mocked(convertCorpCurrency).mock.calls[0][2]).toBe("IEP"); // target currency
    // Wallets are never read and written back: one pipeline update converts
    // each resident from the live document.
    expect(db.collectionMocks["characters"].updateOne).not.toHaveBeenCalled();
    const [filter, pipeline] = db.collectionMocks["characters"].updateMany.mock.calls[0];
    expect(filter).toMatchObject({ homeState: "NIR", currencyBalances: { $type: "object" } });

    const after = applySetStage(pipeline[0].$set, {
      currencyBalances: {
        campaign: 1000,
        personal: { GBP: 5000, USD: 200 },
        savings: { GBP: 10, IEP: 1 },
      },
    });
    expect(after.currencyBalances).toEqual({
      campaign: 2000, // 1000 x 2
      personal: { USD: 200, IEP: 10000 }, // GBP removed, USD kept as forex
      savings: { IEP: 21 }, // 1 + 10 x 2
      pendingSavingsInterest: {},
      interestEarned: {},
    });
    // A balance a player moved after the transfer began is converted as it
    // stands when the update lands, not as an earlier read saw it.
    const later = applySetStage(pipeline[0].$set, {
      currencyBalances: { personal: { GBP: 4000, USD: 200 } },
    });
    expect(later.currencyBalances.personal).toEqual({ USD: 200, IEP: 8000 });
    expect(later.currencyBalances.savings).toEqual({});
  });

  describe("savings accounts", () => {
    function residents(ids: string[]) {
      db.collection("corporations").find.mockReturnValue(cursorOf([]));
      return ids.map((id) => ({ _id: { toString: () => id } }));
    }

    it("closes the old-currency account of each resident that has one, before the wallet converts", async () => {
      const owners = residents(["a", "b", "c"]);
      db.collection("characters").find.mockReturnValue(cursorOf(owners));
      db.collection("savingsAccounts").find.mockReturnValue(
        cursorOf([{ ownerId: owners[0]._id }, { ownerId: owners[2]._id }])
      );

      await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");

      const { closeCharacterSavings } = await import("@/lib/savings/closeCharacterSavings");
      const closed = vi.mocked(closeCharacterSavings).mock.calls;
      expect(closed.map((call) => String(call[1]))).toEqual(["a", "c"]);
      // Only the departing currency, and the legacy balance is left for the
      // wallet conversion instead of being zeroed.
      expect(closed[0][2]).toEqual({ currency: "GBP", keepLegacyProjection: true });
      const [accountFilter] = db.collectionMocks["savingsAccounts"].find.mock.calls[0];
      expect(accountFilter).toMatchObject({
        ownerType: "character",
        currency: "GBP",
        status: { $ne: "closed" },
      });
      const closeOrder = vi.mocked(closeCharacterSavings).mock.invocationCallOrder[0];
      const convertOrder = db.collectionMocks["characters"].updateMany.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(convertOrder);
    });

    it("carries accrued interest and the opened flag into the new currency", async () => {
      db.collection("corporations").find.mockReturnValue(cursorOf([]));
      db.collection("characters").find.mockReturnValue(cursorOf([]));
      await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");
      const [, pipeline] = db.collectionMocks["characters"].updateMany.mock.calls[0];
      const after = applySetStage(pipeline[0].$set, {
        currencyBalances: {
          savings: { GBP: 100 },
          pendingSavingsInterest: { GBP: 3 },
          interestEarned: { GBP: 40, USD: 5 },
        },
        savingsAccountsOpened: { GBP: true, USD: true },
      });
      expect(after.currencyBalances.pendingSavingsInterest).toEqual({ IEP: 6 });
      expect(after.currencyBalances.interestEarned).toEqual({ USD: 5, IEP: 80 });
      expect(after.savingsAccountsOpened).toEqual({ GBP: true, USD: true, IEP: true });
      const unopened = applySetStage(pipeline[0].$set, { currencyBalances: {} });
      expect(unopened.savingsAccountsOpened).toEqual({});
    });

    it("builds the new-currency account for residents who now hold savings in it", async () => {
      const owners = residents(["a", "b"]);
      db.collection("characters")
        .find.mockReturnValueOnce(cursorOf([]))
        .mockReturnValueOnce(cursorOf(owners));
      await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");
      const { ensureSavingsAccount } = await import("@/lib/savings/accountsShell");
      expect(
        vi.mocked(ensureSavingsAccount).mock.calls.map((call) => [String(call[1]), call[2]])
      ).toEqual([
        ["a", "IEP"],
        ["b", "IEP"],
      ]);
      const holderFilter = db.collectionMocks["characters"].find.mock.calls[1][0];
      expect(holderFilter["currencyBalances.savings.IEP"]).toEqual({ $gt: 0 });
    });

    it("fails the transfer rather than leave a holder without an account", async () => {
      const owners = residents(["a"]);
      db.collection("characters")
        .find.mockReturnValueOnce(cursorOf([]))
        .mockReturnValueOnce(cursorOf(owners));
      const { ensureSavingsAccount } = await import("@/lib/savings/accountsShell");
      vi.mocked(ensureSavingsAccount).mockResolvedValueOnce(null);
      await expect(
        convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE")
      ).rejects.toThrow("Savings account could not be created");
    });

    it("leaves account creation to the lazy path when savings accounts are not authoritative", async () => {
      residents([]);
      const { loadBankingPolicy } = await import("@/lib/banking/policy");
      vi.mocked(loadBankingPolicy).mockResolvedValueOnce({ savingsAccounts: "off" } as never);
      await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");
      const { ensureSavingsAccount } = await import("@/lib/savings/accountsShell");
      expect(ensureSavingsAccount).not.toHaveBeenCalled();
    });
  });

  it("converts carried region party-org treasuries at the same scale", async () => {
    // Dissolving-merge path: statePartyOrg rows were re-scoped, not deleted,
    // and their treasuries are still in the old currency.
    db.collection("corporations").find.mockReturnValue(cursorOf([]));
    db.collection("characters").find.mockReturnValue(cursorOf([]));

    await convertTransferredResidentsCurrency(db as unknown as Db, "SN", "UK", "IE");

    const [filter, update] = db.collectionMocks["statePartyOrg"].updateMany.mock.calls[0];
    expect(filter).toEqual({ stateId: "SN" });
    expect(update.$mul.treasury).toBe(2); // IEP(1.0) / GBP(0.5)
  });

  it("no-ops when forex is disabled", async () => {
    vi.mocked(isForexEnabled).mockResolvedValueOnce(false);
    await convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE");
    expect(convertCorpCurrency).not.toHaveBeenCalled();
  });
});

it("refuses strict conversion when exchange rates are missing", async () => {
  const db = createMockDb();
  const { loadFxScalePair } = await import("@/lib/country/mergeFxScale");
  const spy = vi
    .spyOn(await import("@/lib/country/mergeFxScale"), "loadFxScalePair")
    .mockResolvedValueOnce({ kind: "missing-rate" });
  await expect(
    convertTransferredResidentsCurrency(db as unknown as Db, "NIR", "UK", "IE", true)
  ).rejects.toThrow("exchange rates");
  expect(db.collection("characters").updateMany).not.toHaveBeenCalled();
  spy.mockRestore();
  void loadFxScalePair;
});

// Minimal evaluator for the aggregation operators the wallet conversion uses,
// so the test asserts the converted balances rather than the expression shape.
type Doc = Record<string, any>;
function evalExpr(expr: unknown, doc: Doc, vars: Doc = {}): any {
  if (typeof expr === "string" && expr.startsWith("$$")) {
    const [name, ...path] = expr.slice(2).split(".");
    return path.reduce((v, k) => v?.[k], vars[name]);
  }
  if (typeof expr === "string" && expr.startsWith("$"))
    return expr
      .slice(1)
      .split(".")
      .reduce((v: any, k) => v?.[k], doc);
  if (expr === null || typeof expr !== "object" || expr instanceof Date) return expr;
  if (Object.keys(expr).length === 0) return {};
  const [op] = Object.keys(expr);
  const arg = (expr as Doc)[op];
  const ev = (e: unknown) => evalExpr(e, doc, vars);
  switch (op) {
    case "$ifNull": {
      const v = ev(arg[0]);
      return v ?? ev(arg[1]);
    }
    case "$multiply":
      return arg.map(ev).reduce((a: number, b: number) => a * b, 1);
    case "$add":
      return arg.map(ev).reduce((a: number, b: number) => a + b, 0);
    case "$ne":
      return ev(arg[0]) !== ev(arg[1]);
    case "$eq":
      return ev(arg[0]) === ev(arg[1]);
    case "$cond":
      return ev(arg[0]) ? ev(arg[1]) : ev(arg[2]);
    case "$mergeObjects":
      return Object.assign({}, ...arg.map(ev));
    case "$objectToArray":
      return Object.entries(ev(arg)).map(([k, v]) => ({ k, v }));
    case "$arrayToObject":
      return Object.fromEntries(ev(arg).map((e: { k: string; v: unknown }) => [e.k, e.v]));
    case "$filter":
      return ev(arg.input).filter((item: unknown) =>
        evalExpr(arg.cond, doc, { ...vars, this: item })
      );
    default:
      if (op.startsWith("$")) throw new Error(`unsupported operator ${op}`);
      return Object.fromEntries(Object.entries(expr as Doc).map(([k, v]) => [k, ev(v)]));
  }
}

function applySetStage(stage: Doc, doc: Doc): Doc {
  const out: Doc = structuredClone(doc);
  for (const [path, expr] of Object.entries(stage)) {
    const value = evalExpr(expr, doc);
    const keys = path.split(".");
    let node = out;
    for (const k of keys.slice(0, -1)) node = node[k] ??= {};
    node[keys[keys.length - 1]] = value;
  }
  return out;
}
