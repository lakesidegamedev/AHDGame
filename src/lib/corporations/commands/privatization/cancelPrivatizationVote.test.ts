vi.mock("@/lib/db/sessionDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/sessionDb")>()),
  withSessionDb: async (db: Db, work: (db: Db) => Promise<unknown>) => work(db),
}));
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { CorporationPrivatizationVote } from "@/lib/db/types";

vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  refundCharacterCash: vi.fn().mockResolvedValue(true),
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

  it("propagates a refund failure for the enclosing transaction to abort", async () => {
    const { db, updateOne } = makeDb(1);
    vi.mocked(refundCharacterCash).mockRejectedValueOnce(new Error("boom"));
    await expect(
      cancelPrivatizationVote({ db, vote: makeVote(), forexEnabled: true })
    ).rejects.toThrow("boom");
    expect(updateOne).toHaveBeenCalledTimes(1);
  });
});
