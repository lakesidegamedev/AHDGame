import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadSettleableSupplyAgreements } from "./loadSettleableSupplyAgreements";

describe("loadSettleableSupplyAgreements", () => {
  it("retires fixed-term agreements before loading the settlement book", async () => {
    const db = createMockDb();
    db.collection("supplyAgreements");
    const agreements = db.collectionMocks.supplyAgreements;
    const now = new Date("2026-09-12T00:00:00.000Z");

    const loaded = await loadSettleableSupplyAgreements({
      db: db as unknown as Db,
      turn: 68,
      now,
    });

    expect(agreements.updateMany).toHaveBeenNthCalledWith(
      1,
      { status: { $in: ["active", "cancelling"] }, expiresAtTurn: { $lte: 68 } },
      { $set: { status: "cancelled", updatedAt: now }, $unset: { cancelEffectiveTurn: "" } }
    );
    expect(agreements.updateMany).toHaveBeenCalledTimes(4);
    expect(loaded).toEqual({ agreements: [], legacyStateLocalAgreementLive: false });
  });

  it("tells both CEOs when a fixed-term agreement expires, in one batch", async () => {
    vi.resetModules();
    const createNotifications = vi.fn();
    const createNotification = vi.fn();
    vi.doMock("@/lib/notifications", () => ({ createNotifications, createNotification }));
    const { loadSettleableSupplyAgreements: load } =
      await import("./loadSettleableSupplyAgreements");
    const db = createMockDb();
    const supplier = { _id: new ObjectId(), userId: new ObjectId() };
    const buyer = { _id: new ObjectId(), userId: new ObjectId() };
    const agreementId = new ObjectId();
    db.collection("supplyAgreements").find.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: agreementId,
          supplierCorpId: supplier._id,
          buyerCorpId: buyer._id,
          commodity: "steel",
          status: "active",
        },
      ]),
    });
    db.collection("corporations").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([supplier, buyer]),
    });
    await load({ db: db as unknown as Db, turn: 68, now: new Date() });
    expect(createNotification).not.toHaveBeenCalled();
    expect(createNotifications).toHaveBeenCalledTimes(1);
    const inputs = createNotifications.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inputs).toHaveLength(2);
    expect(inputs.map((input) => input.userId)).toEqual([supplier.userId, buyer.userId]);
    expect(inputs[0]).toEqual(
      expect.objectContaining({
        type: "corp_supply_agreement_update",
        metadata: expect.objectContaining({
          corporationId: supplier._id.toString(),
          agreementId: agreementId.toString(),
          event: "expired",
        }),
      })
    );
  });
});
