import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

vi.mock("@/lib/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(5) }));
vi.mock("@/lib/monetaryPolicy/centralBankPricing", () => ({
  loadCentralBankPricingAdjustment: vi.fn().mockResolvedValue({ depositBonusPercentPoints: 0.25 }),
}));
vi.mock("@/lib/banking/policy", () => ({ loadBankingPolicy: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/banking/rules/policy", () => ({ savingsReadsAuthoritative: vi.fn(() => false) }));

import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import { loadSavingsApyByCurrency, loadSavingsApyForCharacter } from "./savingsApy";

const reads: string[] = [];
let corporations: Array<Record<string, unknown>> = [];

// Prime 10, inflation 4 everywhere: CB APY = (10 - 4) / 2 + 0.25 = 3.25.
const db = {
  collection: (name: string) => ({
    find: () => ({
      project: () => ({
        toArray: async () => {
          reads.push(name);
          if (name === "centralBanks") {
            return ["US", "UK", "ECB"].map((id) => ({
              _id: id,
              primeRate: 10,
              inflationHistory: [{ turn: 4, rate: 4 }],
            }));
          }
          return name === "corporations" ? corporations : [];
        },
      }),
    }),
  }),
} as unknown as Db;

function bank(type: string, status = "active", currency = "USD") {
  return {
    _id: new ObjectId(),
    bankCharter: { status, currency, type, depositOffset: -1, lendingOffset: 2 },
  };
}

beforeEach(() => {
  reads.length = 0;
  corporations = [];
  vi.mocked(savingsReadsAuthoritative).mockReturnValue(false);
});

describe("loadSavingsApyForCharacter", () => {
  it("matches the plain CB map and reads no banks when every balance is at the central bank", async () => {
    const base = await loadSavingsApyByCurrency(db);
    reads.length = 0;
    const apy = await loadSavingsApyForCharacter(db, {
      currencyBalances: { savingsHolder: { USD: "centralBank" } },
    } as never);
    expect(apy).toEqual(base);
    expect(apy.USD).toBe(3.25);
    expect(reads).toEqual(["centralBanks"]);
  });

  it("prices a balance held at a private bank as the desk does", async () => {
    const retail = bank("retail");
    corporations = [retail];
    const apy = await loadSavingsApyForCharacter(db, {
      currencyBalances: { savingsHolder: { USD: retail._id.toHexString() } },
    } as never);
    // Posted 9: premium 9 - 3 = 6, plus the 3.25 CB APY that still accrues.
    expect(apy.USD).toBe(9.25);
    expect(apy.GBP).toBe(3.25);
  });

  it("pays only the posted rate in an authoritative currency", async () => {
    const retail = bank("retail");
    corporations = [retail];
    vi.mocked(savingsReadsAuthoritative).mockReturnValue(true);
    const apy = await loadSavingsApyForCharacter(db, {
      currencyBalances: { savingsHolder: { USD: retail._id.toHexString() } },
    } as never);
    expect(apy.USD).toBe(9);
  });

  it("keeps the CB APY for a holder that cannot hold the balance", async () => {
    const investment = bank("investment");
    const failed = bank("retail", "failed");
    const missing = new ObjectId();
    corporations = [investment, failed];
    for (const holder of [investment._id, failed._id, missing]) {
      const apy = await loadSavingsApyForCharacter(db, {
        currencyBalances: { savingsHolder: { USD: holder.toHexString() } },
      } as never);
      expect(apy.USD).toBe(3.25);
    }
  });

  it("quotes no rate for a stale holder in an authoritative currency, where nothing accrues", async () => {
    const failed = bank("retail", "failed");
    corporations = [failed];
    vi.mocked(savingsReadsAuthoritative).mockReturnValue(true);
    const apy = await loadSavingsApyForCharacter(db, {
      currencyBalances: { savingsHolder: { USD: failed._id.toHexString() } },
    } as never);
    expect(apy.USD).toBeUndefined();
    expect(apy.GBP).toBe(3.25);
  });
});
