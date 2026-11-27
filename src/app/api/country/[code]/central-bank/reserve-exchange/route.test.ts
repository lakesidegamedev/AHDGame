import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: vi.fn() }));

let db: MockDb;
const chairCharacterId = new ObjectId();

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: new ObjectId().toString(),
    username: "chair",
    isAdmin: false,
    character: {
      _id: chairCharacterId,
      name: "Chair",
      countryId: "US",
    },
    ...overrides,
  };
}

function makeBank(overrides: Record<string, unknown> = {}) {
  return {
    _id: "US",
    countryId: "US",
    chairCharacterId,
    chairControlsLocked: false,
    spreadFeeReserveBalances: { USD: 1_000 },
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/country/US/central-bank/reserve-exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = () => ({ params: Promise.resolve({ code: "US" }) });

async function setup({
  bank = makeBank(),
  user = makeUser(),
}: {
  bank?: ReturnType<typeof makeBank>;
  user?: ReturnType<typeof makeUser>;
} = {}) {
  db = createMockDb();
  db.collection("centralBanks").findOne.mockResolvedValue(bank);
  db.collection("exchangeRates").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue([
      { _id: "US", countryId: "US", currencyCode: "USD", rate: 1 },
      { _id: "UK", countryId: "UK", currencyCode: "GBP", rate: 0.75 },
    ]),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    project: vi.fn().mockReturnThis(),
  });

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireAuth).mockResolvedValue({ ok: true, user } as never);
}

describe("POST /api/country/[code]/central-bank/reserve-exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts reserve balances at current FX rates with an atomic debit guard", async () => {
    await setup();
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ fromCurrency: "USD", toCurrency: "GBP", amount: 100 }),
      ctx()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    // 100 USD → GBP at 1% spread: fee = max(1, round(100 × 0.01)) = 1, net = 99,
    // received = round(99 × 0.75) = 74. forexRevenue = floor(1/2) = 0.
    expect(json.receivedAmount).toBe(74);
    const exchangeCall = db.collectionMocks.centralBanks.updateOne.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { _id?: string })?._id === "US" &&
        (call[1] as { $inc?: Record<string, number> })?.$inc?.["spreadFeeReserveBalances.GBP"] !==
          undefined
    );
    expect(exchangeCall).toBeDefined();
    expect((exchangeCall![1] as { $inc: Record<string, number> }).$inc).toMatchObject({
      "spreadFeeReserveBalances.USD": -100,
      "spreadFeeReserveBalances.GBP": 74,
      forexRevenue: 0,
    });
  });

  it("rejects non-chair reserve exchanges", async () => {
    await setup({
      user: makeUser({
        character: { _id: new ObjectId(), name: "Not Chair", countryId: "US" },
      }),
    });
    const { POST } = await import("./route");

    const response = await POST(
      makeRequest({ fromCurrency: "USD", toCurrency: "GBP", amount: 100 }),
      ctx()
    );

    expect(response.status).toBe(403);
    expect(db.collectionMocks.centralBanks.updateOne).not.toHaveBeenCalled();
  });
  it("books a JPY spread in the US bank's USD revenue pool", async () => {
    await setup({ bank: makeBank({ spreadFeeReserveBalances: { JPY: 100000 } }) });
    db.collection("exchangeRates").find.mockReturnValue({
      toArray: async () => [
        { _id: "US", countryId: "US", currencyCode: "USD", rate: 1 },
        { _id: "JP", countryId: "JP", currencyCode: "JPY", rate: 100 },
      ],
    } as never);
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({ fromCurrency: "JPY", toCurrency: "USD", amount: 100000 }),
      ctx()
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ spentAmount: 100000, receivedAmount: 990 });
    const [filter, update, options] = db.collectionMocks.centralBanks.updateOne.mock.calls[0];
    expect(update.$inc).toMatchObject({
      "spreadFeeReserveBalances.JPY": -100000,
      "spreadFeeReserveBalances.USD": 990,
      forexRevenue: 5,
    });
    expect(filter).toMatchObject({ chairCharacterId, chairControlsLocked: { $ne: true } });
    expect(options?.upsert).not.toBe(true);
  });
  it("refuses a missing home quote without changing the bank", async () => {
    await setup();
    db.collection("exchangeRates").find.mockReturnValue({
      toArray: async () => [
        { _id: "JP", countryId: "JP", currencyCode: "JPY", rate: 100 },
        { _id: "UK", countryId: "UK", currencyCode: "GBP", rate: 0.75 },
      ],
    } as never);
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({ fromCurrency: "JPY", toCurrency: "GBP", amount: 100000 }),
      ctx()
    );
    expect(response.status).toBe(400);
    expect(db.collectionMocks.centralBanks.updateOne).not.toHaveBeenCalled();
  });
});
