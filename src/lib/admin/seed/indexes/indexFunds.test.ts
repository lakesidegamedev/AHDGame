import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureIndexMock } = vi.hoisted(() => ({ ensureIndexMock: vi.fn() }));

vi.mock("./helpers", () => ({ ensureIndex: ensureIndexMock }));

import { seedIndexFundIndexes } from "./indexFunds";

describe("index fund redemption queue indexes", () => {
  beforeEach(() => ensureIndexMock.mockReset());

  it("indexes each branch of the payout recovery filter", async () => {
    await seedIndexFundIndexes({} as unknown as Db, vi.fn());
    const queue = ensureIndexMock.mock.calls.filter((c) => c[1] === "indexFundRedemptionQueue");
    const partials = queue
      .map((c) => c[3].partialFilterExpression)
      .filter((p): p is Record<string, unknown> => p !== undefined);
    expect(partials).toContainEqual({ status: "processing" });
    expect(partials).toContainEqual({ pendingSettlementProjection: { $exists: true } });
  });
});
