import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureIndexMock } = vi.hoisted(() => ({ ensureIndexMock: vi.fn() }));

vi.mock("./helpers", () => ({ ensureIndex: ensureIndexMock }));

import { seedBankingIndexes } from "./banking";

describe("seedBankingIndexes", () => {
  beforeEach(() => ensureIndexMock.mockReset());

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
