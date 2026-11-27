import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createNewsPost, editNewsPost } from "./newsCommands";
import { moneyHistoryKind, moneyHistoryWallet } from "@/lib/character/moneyHistory/rules";
import { deriveLedgerEntries } from "@/lib/ledger/deriveFromTx";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
let ownedDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendNewsEvent: vi.fn(),
  DISCORD_COLORS: { newsPost: 1 },
}));
vi.mock("@/lib/achievements/triggers", () => ({ checkNewsPostAchievements: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/db/patreonBorders", () => ({ fetchBordersByUserIds: async () => new Map() }));
vi.mock("@/lib/siteMetadata", () => ({ getSiteUrl: () => "https://example.com" }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
import { sendNewsEvent } from "@/lib/discordWebhooks";
import { checkNewsPostAchievements } from "@/lib/achievements/triggers";
const user = new ObjectId(),
  inactive = new ObjectId(),
  active = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  vi.mocked(sendNewsEvent).mockClear();
  vi.mocked(checkNewsPostAchievements).mockClear();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, preset: "2027-default" },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 },
    { _id: "CA", currencyCode: "CAD", rate: 2, baseRate: 2 },
  ]);
  f.memory.seed("users", [{ _id: user, activeCharacterId: active }]);
  f.memory.seed("characters", [
    {
      _id: inactive,
      userId: user,
      name: "Inactive character",
      countryId: "US",
      party: "independent",
      actions: 20,
      currencyBalances: { personal: { USD: 500000 } },
    },
    {
      _id: active,
      userId: user,
      name: "Active character",
      countryId: "CA",
      party: "independent",
      actions: 20,
      currencyBalances: { personal: { CAD: 500000 } },
    },
  ]);
  return f;
}
const run = (db: Db, feedType: "advertisement" | "article" = "advertisement") => {
  ownedDb = db;
  return createNewsPost(db, { userId: String(user), content: "Synthetic post content", feedType });
};
describe("sponsored publication and active author", () => {
  it.each([
    { collection: "characters", op: "updateOne" as const, onCall: 2 },
    { collection: "newsPosts", op: "insertOne" as const, onCall: 1 },
    { collection: "financialTxLog", op: "insertOne" as const, onCall: 1 },
  ])(
    "a landed $collection interruption restores charge and post without external publication",
    async (point) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { ...point, afterWrite: true });
      await expect(run(fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(sendNewsEvent).not.toHaveBeenCalled();
      expect(checkNewsPostAchievements).not.toHaveBeenCalled();
      expect(await db.collection("newsPosts").countDocuments({})).toBe(0);
      expect(await db.collection("financialTxLog").countDocuments({})).toBe(0);
      expect(
        (await db.collection("characters").findOne({ _id: active }))?.currencyBalances.personal.CAD
      ).toBe(500000);
      const reply = await run(db);
      expect(reply.post.authorId).toBe(String(active));
      expect((await db.collection("characters").findOne({ _id: active }))?.actions).toBe(15);
      expect(
        (await db.collection("characters").findOne({ _id: inactive }))?.currencyBalances.personal
          .USD
      ).toBe(500000);
      const receipt = await db
        .collection("financialTxLog")
        .findOne({ type: "sponsored_post_payment" });
      expect(receipt).toMatchObject({
        subjectId: active,
        amount: -100000,
        currencyCode: "CAD",
        meta: { wallet: "personal", newsPostId: reply.post._id },
      });
      expect(moneyHistoryKind("sponsored_post_payment")).toBe("sponsored_post");
      expect(moneyHistoryWallet("sponsored_post_payment", receipt!.meta)).toBe("personal");
      expect(
        deriveLedgerEntries([receipt as unknown as FinancialTxLogEntry])[0].legs.some((leg) =>
          leg.account.includes("sponsored_news_placement")
        )
      ).toBe(true);
      await expect(run(db)).rejects.toMatchObject({ status: 429 });
      expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
    }
  );
  it.each(["article", "advertisement"] as const)(
    "overlapping %s requests publish one post",
    async (feedType) => {
      const { db } = fixture();
      const replies = await Promise.allSettled([run(db, feedType), run(db, feedType)]);
      expect(replies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
      expect((await db.collection("characters").findOne({ _id: active }))?.actions).toBe(
        feedType === "article" ? 20 : 15
      );
    }
  );
  it("will not edit a sibling character's post or post during a turn", async () => {
    const { db } = fixture();
    const post = await db
      .collection("newsPosts")
      .insertOne({ authorId: inactive, content: "Old post" });
    await expect(
      editNewsPost(db, {
        userId: String(user),
        postId: String(post.insertedId),
        content: "Changed",
      })
    ).rejects.toMatchObject({ status: 403 });
    await db.collection("gameState").updateOne({}, { $set: { isProcessing: true } });
    await expect(run(db)).rejects.toMatchObject({ status: 409 });
    expect((await db.collection("characters").findOne({ _id: active }))?.actions).toBe(20);
  });
});
