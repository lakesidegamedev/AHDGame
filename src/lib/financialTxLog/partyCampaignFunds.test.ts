import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { emitTx } from "@/lib/financialTxLog/emit";
import { emitPartyCampaignFunds } from "./partyCampaignFunds";

vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn(async () => ({})) }));

const base = {
  characterId: new ObjectId(),
  characterName: "Member",
  currencyCode: "USD" as const,
  turn: 12,
  partyId: "p1",
  partyName: "Party",
};

beforeEach(() => vi.clearAllMocks());

describe("emitPartyCampaignFunds", () => {
  it("records a donation as a campaign debit on the character's own log", async () => {
    await emitPartyCampaignFunds({} as Db, { ...base, amount: -500, flow: "donation" });
    expect(emitTx).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        type: "party_transfer",
        subjectType: "character",
        subjectId: base.characterId,
        amount: -500,
        meta: expect.objectContaining({ wallet: "campaign", flow: "donation" }),
      })
    );
  });

  it("records a party payout as a campaign credit", async () => {
    await emitPartyCampaignFunds({} as Db, { ...base, amount: 750, flow: "payout" });
    expect(vi.mocked(emitTx).mock.calls[0][1]).toMatchObject({ amount: 750 });
  });

  it("skips zero amounts and never throws", async () => {
    await emitPartyCampaignFunds({} as Db, { ...base, amount: 0, flow: "payout" });
    expect(emitTx).not.toHaveBeenCalled();
    vi.mocked(emitTx).mockRejectedValueOnce(new Error("down"));
    await expect(
      emitPartyCampaignFunds({} as Db, { ...base, amount: 5, flow: "payout" })
    ).resolves.toBeUndefined();
  });
});
