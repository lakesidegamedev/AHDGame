import { describe, it, expect, vi } from "vitest";
import type { Db, Document } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
vi.mock("@/lib/country/registeredCountries", () => ({
  getRegisteredCountryIds: vi.fn().mockResolvedValue(["UK", "JP", "DE"]),
}));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePreset: vi.fn().mockResolvedValue("1991-default"),
}));
vi.mock("@/lib/turn/parliamentaryGovernment", () => ({
  getParliamentaryCountryIds: vi.fn().mockReturnValue(["UK", "JP", "DE"]),
}));
vi.mock("@/lib/uk/confidence/confidenceGaugeStore", () => ({
  tickParliamentaryGovernmentConfidence: vi.fn(async (db: Db) => {
    await db
      .collection<Document & { _id: string }>("governmentFormations")
      .updateMany({ _id: { $in: ["JP", "DE"] } }, { $set: { confidenceGauge: 47 } });
  }),
}));
import { runParliamentaryGovernmentConfidencePhase } from "./parliamentaryGovernmentConfidencePhase";
describe("post-election confidence ordering", () => {
  it("finishes the snap turn at exactly 50 after normal drift, then permits later drift", async () => {
    const memory = createInMemoryDb();
    memory.seed(
      "governmentFormations",
      ["UK", "JP", "DE"].map((_id) => ({ _id, confidenceGauge: 47 }))
    );
    const db = memory as unknown as Db;
    const events = ["UK", "JP", "DE"].map((countryId) => ({ countryId, startTurn: 3, turn: 100 }));
    await runParliamentaryGovernmentConfidencePhase(db, new Date("2026-01-01"), 100, events);
    for (const row of await db
      .collection<Document & { _id: string }>("governmentFormations")
      .find({})
      .toArray())
      expect(row.confidenceGauge).toBe(50);
    await runParliamentaryGovernmentConfidencePhase(db, new Date("2026-01-02"), 101, events);
    expect(
      (
        await db
          .collection<Document & { _id: string }>("governmentFormations")
          .findOne({ _id: "JP" })
      )?.confidenceGauge
    ).toBe(47);
  });
  it("leaves ordinary confidence ticks alone without a completed snap", async () => {
    const memory = createInMemoryDb();
    memory.seed("governmentFormations", [{ _id: "JP", confidenceGauge: 10 }]);
    await runParliamentaryGovernmentConfidencePhase(memory as unknown as Db, new Date(), 100);
    expect(
      (
        await (memory as unknown as Db)
          .collection<Document & { _id: string }>("governmentFormations")
          .findOne({ _id: "JP" })
      )?.confidenceGauge
    ).toBe(47);
  });
});
