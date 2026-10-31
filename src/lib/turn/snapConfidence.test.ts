import { describe, it, expect, vi } from "vitest";
import type { Db, Document } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { resetCompletedSnapConfidence } from "./snapConfidence";
const now = new Date("2026-01-01");
describe("completed snap confidence persistence", () => {
  it.each(["UK", "JP", "DE", "IE"])("sets %s to exactly 50 and records once", async (countryId) => {
    const memory = createInMemoryDb();
    memory.seed("governmentFormations", [
      {
        _id: countryId,
        confidenceGauge: 0,
        confidenceGaugeHistory: [{ turn: 99, value: 0, reason: "turn" }],
      },
    ]);
    const db = memory as unknown as Db;
    const event = { countryId, startTurn: 3, turn: 100 };
    await resetCompletedSnapConfidence(db, [event], now);
    let doc = await db
      .collection<Document & { _id: string }>("governmentFormations")
      .findOne({ _id: countryId });
    expect(doc?.confidenceGauge).toBe(50);
    expect(doc?.confidenceSnapStartTurn).toBe(3);
    expect(doc?.confidenceGaugeHistory).toHaveLength(2);
    await db
      .collection<Document & { _id: string }>("governmentFormations")
      .updateOne({ _id: countryId }, { $set: { confidenceGauge: 47 } });
    await resetCompletedSnapConfidence(db, [event, event, { ...event, startTurn: 2 }], now);
    doc = await db
      .collection<Document & { _id: string }>("governmentFormations")
      .findOne({ _id: countryId });
    expect(doc?.confidenceGauge).toBe(47);
    expect(doc?.confidenceGaugeHistory).toHaveLength(2);
    await resetCompletedSnapConfidence(db, [{ ...event, startTurn: 4, turn: 200 }], now);
    expect(
      (
        await db
          .collection<Document & { _id: string }>("governmentFormations")
          .findOne({ _id: countryId })
      )?.confidenceGauge
    ).toBe(50);
  });
  it("sets higher confidence to 50 too", async () => {
    const memory = createInMemoryDb();
    memory.seed("governmentFormations", [{ _id: "UK", confidenceGauge: 90 }]);
    await resetCompletedSnapConfidence(
      memory as unknown as Db,
      [{ countryId: "UK", startTurn: 1, turn: 100 }],
      now
    );
    expect(
      (
        await (memory as unknown as Db)
          .collection<Document & { _id: string }>("governmentFormations")
          .findOne({ _id: "UK" })
      )?.confidenceGauge
    ).toBe(50);
  });
  it("preserves existing state and history bounds", async () => {
    const memory = createInMemoryDb();
    memory.seed("governmentFormations", [
      {
        _id: "UK",
        confidenceGauge: 0,
        status: "pending",
        pmVacancyDeadlineTurn: 196,
        confidenceGaugeHistory: Array.from({ length: 500 }, (_, turn) => ({
          turn,
          value: 0,
          reason: "turn",
        })),
      },
    ]);
    const db = memory as unknown as Db;
    await resetCompletedSnapConfidence(db, [{ countryId: "UK", startTurn: 1, turn: 501 }], now);
    const doc = await db
      .collection<Document & { _id: string }>("governmentFormations")
      .findOne({ _id: "UK" });
    expect(doc?.confidenceGaugeHistory).toHaveLength(500);
    expect(doc?.confidenceGaugeHistory.at(-1)).toMatchObject({
      turn: 501,
      value: 50,
      reason: "snapElectionCompleted",
    });
    expect(doc?.status).toBe("pending");
    expect(doc?.pmVacancyDeadlineTurn).toBe(196);
  });
  it("does not create a missing government", async () => {
    const memory = createInMemoryDb();
    await resetCompletedSnapConfidence(
      memory as unknown as Db,
      [{ countryId: "UK", startTurn: 1, turn: 100 }],
      now
    );
    expect(
      await (memory as unknown as Db)
        .collection<Document & { _id: string }>("governmentFormations")
        .countDocuments({})
    ).toBe(0);
  });
  it("batches countries and serializes concurrent resets", async () => {
    const memory = createInMemoryDb();
    memory.seed(
      "governmentFormations",
      ["UK", "JP", "DE"].map((_id) => ({ _id, confidenceGauge: 0 }))
    );
    const collection = (memory as unknown as Db).collection<Document & { _id: string }>(
      "governmentFormations"
    );
    const bulk = vi.spyOn(collection, "bulkWrite");
    const events = ["UK", "JP", "DE"].map((countryId) => ({ countryId, startTurn: 3, turn: 100 }));
    await Promise.all(
      [1, 2].map(() => resetCompletedSnapConfidence(memory as unknown as Db, events, now))
    );
    expect(bulk).toHaveBeenCalledTimes(2);
    for (const row of await collection.find({}).toArray())
      expect(row.confidenceGaugeHistory).toHaveLength(1);
  });
});
