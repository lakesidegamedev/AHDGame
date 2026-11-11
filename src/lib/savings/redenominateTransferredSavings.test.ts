import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { redenominateTransferredSavings } from "./redenominateTransferredSavings";
import { redenominateSavings } from "./rules/redenomination";
// This fixture executes real reads and writes. Transaction rollback is verified
// separately by the shared sessionDb suite, not emulated by this fixture.
vi.mock("@/lib/db/sessionDb", () => ({
  withSessionDb: (db: Db, work: (db: Db) => Promise<void>) => work(db),
}));
function world(legacy = false, target = false) {
  const db = createInMemoryDb();
  db.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  db.seed("gameConfig", [{ _id: "default", savingsAccountsMode: "authoritative" }]);
  const ownerId = new ObjectId();
  const sourceId = new ObjectId();
  db.seed("characters", [
    {
      _id: ownerId,
      userId: new ObjectId(),
      homeState: "NIR",
      currencyBalances: {
        savings: { GBP: 100, IEP: target ? 20 : 0 },
        pendingSavingsInterest: { GBP: 3 },
        interestEarned: { GBP: 9 },
        savingsHolder: { GBP: "centralBank" },
      },
      savingsAccountsOpened: { GBP: true },
    },
  ]);
  db.seed("centralBanks", [
    { _id: "UK", externalBroadMoney: 1000, householdSavingsLiability: legacy ? 0 : 100 },
    { _id: "IE", externalBroadMoney: 1000, householdSavingsLiability: target ? 20 : 0 },
  ]);
  const account = {
    ownerType: "character",
    ownerId,
    holder: "centralBank",
    status: "open",
    version: 1,
    accruedInterest: 3,
    interestEarned: 9,
    openedTurn: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.seed("savingsAccounts", [
    ...(legacy ? [] : [{ ...account, _id: sourceId, currency: "GBP", balance: 100 }]),
    ...(target
      ? [
          {
            ...account,
            _id: new ObjectId(),
            currency: "IEP",
            balance: 20,
            accruedInterest: 2,
            interestEarned: 4,
          },
        ]
      : []),
  ]);
  return { db, ownerId, sourceId };
}
describe("transferred savings bounded replay", () => {
  it.each([false, true])(
    "conserves value and is idempotent with existing destination=%s",
    async (target) => {
      const { db, ownerId, sourceId } = world(false, target);
      await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2);
      const account = await db.collection("savingsAccounts").findOne({ ownerId, currency: "IEP" });
      expect(account?.balance).toBe(target ? 220 : 200);
      expect(account?.accruedInterest).toBe(target ? 8 : 6);
      expect((await db.collection("savingsAccounts").findOne({ _id: sourceId }))?.balance).toBe(0);
      const before = JSON.stringify(
        await Promise.all(
          ["characters", "savingsAccounts", "centralBanks"].map((name) =>
            db.collection(name).find({}).toArray()
          )
        )
      );
      await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2);
      expect(
        JSON.stringify(
          await Promise.all(
            ["characters", "savingsAccounts", "centralBanks"].map((name) =>
              db.collection(name).find({}).toArray()
            )
          )
        )
      ).toBe(before);
      const uk = await db.collection("centralBanks").findOne({ _id: "UK" });
      const ie = await db.collection("centralBanks").findOne({ _id: "IE" });
      expect(Number(uk?.externalBroadMoney) + Number(ie?.externalBroadMoney) / 2).toBe(1500);
    }
  );
  it("materializes a withdrawable account from legacy flags and interest", async () => {
    const { db, ownerId } = world(true);
    await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2);
    const character = await db.collection("characters").findOne({ _id: ownerId });
    expect(character?.savingsAccountsOpened).toEqual({ IEP: true });
    expect(character?.currencyBalances).toMatchObject({
      savings: { IEP: 200 },
      pendingSavingsInterest: { IEP: 6 },
      interestEarned: { IEP: 18 },
      savingsHolder: { IEP: "centralBank" },
    });
    expect(await db.collection("savingsAccounts").countDocuments({})).toBe(1);
    expect(
      await db.collection("savingsAccounts").findOne({ ownerId, currency: "IEP" })
    ).toMatchObject({
      ownerType: "character",
      status: "open",
      balance: 200,
      accruedInterest: 6,
      openedTurn: 10,
    });
    expect(
      (await db.collection("centralBanks").findOne({ _id: "IE" }))?.householdSavingsLiability
    ).toBe(200);
    await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2);
    expect(await db.collection("savingsAccounts").countDocuments({})).toBe(1);
    expect(
      (await db.collection("savingsAccounts").findOne({ ownerId, currency: "IEP" }))?.balance
    ).toBe(200);
  });
  it("repairs an already converted mirror without adding it to the deposit", async () => {
    const { db, ownerId } = world();
    await db
      .collection("characters")
      .updateOne({ _id: ownerId }, { $set: { "currencyBalances.savings": { IEP: 190 } } });
    await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2, {
      ownerId: String(ownerId),
      expectedConvertedBalance: 190,
      expectedSourceBalance: 100,
    });
    expect(
      (await db.collection("savingsAccounts").findOne({ ownerId, currency: "IEP" }))?.balance
    ).toBe(200);
  });
  it("refuses changed repair evidence before moving backing", async () => {
    const { db, ownerId } = world();
    const before = JSON.stringify(
      await Promise.all(
        ["characters", "savingsAccounts", "centralBanks"].map((name) =>
          db.collection(name).find({}).toArray()
        )
      )
    );
    await expect(
      redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2, {
        ownerId: String(ownerId),
        expectedConvertedBalance: 190,
        expectedSourceBalance: 100,
      })
    ).rejects.toThrow("evidence changed");
    expect(
      JSON.stringify(
        await Promise.all(
          ["characters", "savingsAccounts", "centralBanks"].map((name) =>
            db.collection(name).find({}).toArray()
          )
        )
      )
    ).toBe(before);
  });
  it("moves a funded private-bank claim and cash without duplicating central backing", async () => {
    const { db, sourceId, ownerId } = world();
    const bankId = new ObjectId();
    db.seed("corporations", [
      {
        _id: bankId,
        bankCharter: { currency: "GBP", status: "active", cashReserves: 300, playerDeposits: 100 },
      },
    ]);
    await db
      .collection("savingsAccounts")
      .updateOne({ _id: sourceId }, { $set: { holder: String(bankId) } });
    await db
      .collection("centralBanks")
      .updateOne({ _id: "UK" }, { $set: { householdSavingsLiability: 0 } });
    await redenominateTransferredSavings(db as unknown as Db, "NIR", "GBP", "IEP", 2);
    expect(
      (await db.collection("corporations").findOne({ _id: bankId }))?.bankCharter
    ).toMatchObject({ cashReserves: 200, playerDeposits: 0 });
    expect(
      (await db.collection("savingsAccounts").findOne({ ownerId, currency: "IEP" }))?.balance
    ).toBe(200);
    expect((await db.collection("centralBanks").findOne({ _id: "UK" }))?.externalBroadMoney).toBe(
      1000
    );
  });
  it.each(["GBP", "USD"])("leaves same-currency savings untouched (%s)", async (currency) => {
    const { db } = world();
    await redenominateTransferredSavings(
      db as unknown as Db,
      "NIR",
      currency as "GBP" | "USD",
      currency as "GBP" | "USD",
      1
    );
    expect(
      await db.collection("savingsAccounts").countDocuments({ currency: "GBP", status: "open" })
    ).toBe(1);
  });
  it.each([0, -1, NaN, Infinity])("refuses invalid conversion rate %s", (scale) => {
    expect(() =>
      redenominateSavings(
        { balance: 1, accruedInterest: 0, interestEarned: 0 },
        { balance: 0, accruedInterest: 0, interestEarned: 0 },
        scale
      )
    ).toThrow();
  });
});
