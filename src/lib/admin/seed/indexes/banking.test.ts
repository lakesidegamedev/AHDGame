import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureIndexMock } = vi.hoisted(() => ({ ensureIndexMock: vi.fn() }));

vi.mock("./helpers", () => ({ ensureIndex: ensureIndexMock }));

import { seedBankingIndexes } from "./banking";

describe("seedBankingIndexes", () => {
  beforeEach(() => ensureIndexMock.mockReset());

  it("restores non-unique bank servicing and all-currency savings lookups after reset", async () => {
    await seedBankingIndexes({} as unknown as Db, vi.fn());
    for (const [collection, key] of [
      ["corporations", { npcBankSeedKey: 1 }],
      ["characters", { "currencyBalances.savingsHolder.$**": 1 }],
      ["bankLoans", { bankCorporationId: 1, status: 1, borrowerType: 1, lastProcessedTurn: 1 }],
    ] as const) {
      const call = ensureIndexMock.mock.calls.find(
        (c) => c[1] === collection && JSON.stringify(c[2]) === JSON.stringify(key)
      );
      expect(call).toBeDefined();
      expect(call![3].unique).not.toBe(true);
    }
  });

  it("keeps unfinished-move prefix lookups indexed", async () => {
    await seedBankingIndexes({} as unknown as Db, vi.fn());

    const created = ensureIndexMock.mock.calls.map((call) => ({
      collection: call[1],
      key: call[2],
      options: call[3],
    }));

    expect(created).toEqual(
      expect.arrayContaining([
        {
          collection: "bankMoneyMoves",
          key: { status: 1, _id: 1 },
          options: expect.objectContaining({ name: "bankMoneyMoves_status_id" }),
        },
      ])
    );
  });
});
