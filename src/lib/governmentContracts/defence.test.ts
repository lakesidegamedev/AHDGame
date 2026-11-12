import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { AuthUserWithCharacter } from "@/lib/auth";
import type { ContractBid, GovernmentTender } from "./types";

const convertDefenceReservation = vi.fn();
vi.mock("./reservations", () => ({
  convertDefenceReservation: (...args: unknown[]) => convertDefenceReservation(...args),
  fenceDefenceReservation: vi.fn().mockResolvedValue(true),
}));
const lockContractPlant = vi.fn().mockResolvedValue(true);
const releaseContractPlant = vi.fn().mockResolvedValue(undefined);
vi.mock("./plantSlots", () => ({
  lockContractPlant: (...args: unknown[]) => lockContractPlant(...args),
  releaseContractPlant: (...args: unknown[]) => releaseContractPlant(...args),
}));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn() }));

import { activateDefenceBid } from "./defence";

describe("activateDefenceBid with a vanished winner", () => {
  it("reopens the tender and never converts the reservation", async () => {
    const db = createMockDb();
    db.collection("defenceContracts").findOne.mockResolvedValue(null);
    db.collection("corporations").countDocuments.mockResolvedValue(0);
    const winnerId = new ObjectId();
    const tender = {
      _id: new ObjectId(),
      contractId: new ObjectId().toHexString(),
      status: "awarding",
      awardLeaseKey: "lease",
      preparedDefence: { corporationId: winnerId, encumberedAmount: 10 },
      preparedDefenseLine: 5,
      preparedStateOwned: false,
    } as unknown as GovernmentTender;
    const bid = {
      corporationId: winnerId.toHexString(),
      sectorId: new ObjectId().toHexString(),
      amount: 1,
    } as unknown as ContractBid;

    await expect(
      activateDefenceBid(
        db as unknown as Db,
        tender,
        bid,
        {} as AuthUserWithCharacter,
        10,
        new Date()
      )
    ).rejects.toThrow(/no longer exists/);

    expect(convertDefenceReservation).not.toHaveBeenCalled();
    expect(releaseContractPlant).toHaveBeenCalled();
    const reset = db.collection("governmentTenders").updateOne.mock.calls[0]!;
    expect(reset[1]).toMatchObject({ $set: { status: "open" } });
  });
});
