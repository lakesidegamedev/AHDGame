import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { CorporationPrivatizationVote } from "@/lib/db/types";

vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  refundCharacterCash: vi.fn(),
}));

import { refundCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import { cancelPrivatizationVote } from "./cancelPrivatizationVote";

function makeVote(): CorporationPrivatizationVote {
  return {
    _id: new ObjectId(),
    status: "open",
    openedByCharacterId: new ObjectId(),
    reservedCashCurrency: "USD",
    totalReservedCash: 500,
  } as unknown as CorporationPrivatizationVote;
}

function makeDb(matchedCount: number) {
  const updateOne = vi.fn().mockResolvedValue({ matchedCount });
  const db = { collection: vi.fn(() => ({ updateOne })) } as unknown as Db;
  return { db, updateOne };
}

describe("cancelPrivatizationVote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the vote before refunding the reserve", async () => {
    const { db, updateOne } = makeDb(1);
    const res = await cancelPrivatizationVote({ db, vote: makeVote(), forexEnabled: true });
    expect(res).toEqual({ ok: true });
    expect(refundCharacterCash).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refundCharacterCash).mock.invocationCallOrder[0]
    );
  });

  it("does not refund when another resolver already claimed the vote", async () => {
    const { db } = makeDb(0);
    const res = await cancelPrivatizationVote({ db, vote: makeVote(), forexEnabled: true });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(refundCharacterCash).not.toHaveBeenCalled();
  });

  it("reopens the vote when the refund throws", async () => {
    const { db, updateOne } = makeDb(1);
    vi.mocked(refundCharacterCash).mockRejectedValueOnce(new Error("boom"));
    await expect(
      cancelPrivatizationVote({ db, vote: makeVote(), forexEnabled: true })
    ).rejects.toThrow("boom");
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls[1][1].$set.status).toBe("open");
  });
});
