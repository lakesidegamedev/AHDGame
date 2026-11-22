import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));

const FUTURE = new Date(Date.now() + 86_400_000);

function tx(characterId: ObjectId, over: Record<string, unknown>) {
  return {
    _id: new ObjectId(),
    type: "corp_dividend",
    turn: 5,
    createdAt: new Date(),
    expiresAt: FUTURE,
    subjectType: "character",
    subjectId: characterId,
    subjectName: "Someone",
    amount: 100,
    currencyCode: "USD",
    flagged: true,
    suspectFlags: [{ type: "velocity" }],
    meta: { secret: "internal" },
    ...over,
  };
}

describe("GET /api/character/money-history", () => {
  const userA = new ObjectId();
  const userB = new ObjectId();
  const charA = new ObjectId();
  const charB = new ObjectId();
  let db: ReturnType<typeof createInMemoryDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createInMemoryDb();
    await db.collection("users").insertMany([{ _id: userA }, { _id: userB }]);
    await db.collection("characters").insertMany([
      { _id: charA, userId: userA, name: "A" },
      { _id: charB, userId: userB, name: "B" },
    ]);
    await db
      .collection("financialTxLog")
      .insertMany([
        tx(charA, { amount: 10 }),
        tx(charA, { type: "office_income", amount: 20 }),
        tx(charA, { amount: 30, expiresAt: new Date(Date.now() - 1000) }),
        tx(charB, { amount: 999 }),
        tx(charA, { subjectType: "corporation", amount: 777 }),
      ]);
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  async function call(userId: ObjectId | null, qs = "") {
    const { requireBasicAuth } = await import("@/lib/api/requireAuth");
    vi.mocked(requireBasicAuth).mockResolvedValue(
      (userId
        ? { ok: true, user: { userId: userId.toString() } }
        : {
            ok: false,
            response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
          }) as never
    );
    const { GET } = await import("./route");
    return GET(new Request(`http://localhost/api/character/money-history${qs}`));
  }

  it("returns 401 when signed out", async () => {
    expect((await call(null)).status).toBe(401);
  });

  it("returns only the signed-in character's own, unexpired rows", async () => {
    const res = await call(userA);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.rows.map((r: { amount: number }) => r.amount).sort()).toEqual([10, 20]);
  });

  it("user B never sees user A's rows", async () => {
    const body = await (await call(userB)).json();
    expect(body.rows.map((r: { amount: number }) => r.amount)).toEqual([999]);
  });

  it("ignores any character id supplied by the caller", async () => {
    const body = await (await call(userB, `?characterId=${charA}&subjectId=${charA}`)).json();
    expect(body.rows.map((r: { amount: number }) => r.amount)).toEqual([999]);
  });

  it("exposes no internal fields", async () => {
    const body = await (await call(userA)).json();
    const text = JSON.stringify(body);
    expect(text).not.toContain("suspect");
    expect(text).not.toContain("flagged");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("subjectId");
  });

  it("paginates newest first and filters by wallet", async () => {
    const first = await (await call(userA, "?limit=1")).json();
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].amount).toBe(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await (await call(userA, `?limit=1&cursor=${first.nextCursor}`)).json();
    expect(second.rows[0].amount).toBe(10);
    expect(second.nextCursor).toBeNull();
    const campaign = await (await call(userA, "?wallet=campaign")).json();
    expect(campaign.rows.map((r: { kind: string }) => r.kind)).toEqual(["office_income"]);
  });

  it("rejects a bad query with no-store", async () => {
    const res = await call(userA, "?limit=9999");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
