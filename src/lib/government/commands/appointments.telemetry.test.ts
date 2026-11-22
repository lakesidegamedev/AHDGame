vi.mock("@/lib/db/sessionDb", () => ({
  withSessionDb: (_db: unknown, work: (db: unknown) => Promise<unknown>) => work(_db),
  afterCommit: (_db: unknown, effect: () => Promise<unknown>) => effect(),
  unboundDb: (db: unknown) => db,
  boundSession: () => undefined,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { getGameState } from "@/lib/gameState";
import { adminAppointPrimeMinister } from "./appointments";

vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/utils/politics", () => ({ getOfficeLabel: vi.fn(() => "Prime Minister") }));
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn().mockResolvedValue(undefined),
}));

describe("admin appointment state reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed when outgoing offices cannot be read", async () => {
    const db = createMockDb();
    const characterId = new ObjectId();
    db.collection("characters");
    db.collectionMocks.characters.findOne.mockResolvedValue({
      _id: characterId,
      countryId: "UK",
      careerHistory: [],
    });
    db.collectionMocks.characters.find.mockReturnValue({
      toArray: vi.fn().mockRejectedValue(new Error("telemetry read failed")),
    } as never);
    vi.mocked(getGameState).mockResolvedValue({ currentTurn: 100 } as never);
    await expect(
      adminAppointPrimeMinister(
        db as unknown as Db,
        "admin",
        "UK",
        COUNTRY_CONFIGS.UK,
        characterId.toString()
      )
    ).rejects.toThrow("telemetry read failed");
    expect(db.collectionMocks.characters.updateOne).not.toHaveBeenCalled();
  });
});
