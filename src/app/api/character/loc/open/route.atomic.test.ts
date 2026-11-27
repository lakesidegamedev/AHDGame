import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { POST } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: vi.fn(async () => ({ ok: true, user: { userId: "account" } })),
}));
vi.mock("@/lib/db/characterLookup", () => ({ getCharacterByUserId: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
  SAVINGS_WALLET_LIMITS: { maxRequests: 10, windowMs: 1000 },
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/lineOfCredit/featureFlag", () => ({
  isLineOfCreditEnabled: vi.fn(async () => true),
}));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 5 })) }));
const request = () =>
  new Request("http://localhost/api/character/loc/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currency: "JPY" }),
  });
function setup() {
  const fixture = createTransactionalMemoryDb();
  const id = new ObjectId();
  fixture.memory.seed("gameState", [{ _id: "current", currentTurn: 5, isProcessing: false }]);
  fixture.memory.seed("characters", [
    {
      _id: id,
      lineOfCredit: {
        balances: { USD: 150 },
        arrears: { USD: 3 },
        accountsOpened: { USD: true },
        drawFrozen: true,
      },
      lineOfCreditRevision: 7,
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(fixture.db);
  vi.mocked(getCharacterByUserId).mockImplementation(
    async () =>
      ({
        _id: id,
        lineOfCredit: {
          balances: { USD: 100 },
          arrears: {},
          accountsOpened: { USD: true },
          drawFrozen: false,
        },
      }) as never
  );
  return fixture;
}
describe("credit account publication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves newer debt and freeze fields rather than copying the reader snapshot", async () => {
    const { memory } = setup();
    expect((await POST(request())).status).toBe(200);
    expect(memory.collection("characters").docs[0]).toMatchObject({
      lineOfCredit: {
        balances: { USD: 150 },
        arrears: { USD: 3 },
        accountsOpened: { USD: true, JPY: true },
        drawFrozen: true,
      },
      lineOfCreditRevision: 8,
    });
    expect(memory.collection("locLedger").docs).toHaveLength(1);
    expect((await POST(request())).status).toBe(409);
    expect(memory.collection("locLedger").docs).toHaveLength(1);
  });
  it("rolls back an acknowledged opening if ledger publication fails, then retries once", async () => {
    const { memory } = setup();
    const fault = withInjectedCrash(memory, {
      collection: "locLedger",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await POST(request())).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(memory.collection("characters").docs[0].lineOfCreditRevision).toBe(7);
    expect(memory.collection("locLedger").docs).toHaveLength(0);
    expect((await POST(request())).status).toBe(200);
    expect(memory.collection("locLedger").docs).toHaveLength(1);
  });
  it("does not open a bucket while an existing loan settlement owns the book", async () => {
    const { memory } = setup();
    memory.collection("characters").docs[0].pendingLocSettlement = "draw";
    expect((await POST(request())).status).toBe(409);
    expect(memory.collection("characters").docs[0].lineOfCreditRevision).toBe(7);
    expect(memory.collection("locLedger").docs).toHaveLength(0);
  });
});
