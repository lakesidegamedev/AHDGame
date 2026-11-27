import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { attemptPlantSectorSplit } from "./plantSectorSplitAttempt";

function world() {
  const { db, memory } = createTransactionalMemoryDb();
  const attacker = new ObjectId(),
    defender = new ObjectId(),
    sectorId = new ObjectId();
  memory.seed("corporations", [
    {
      _id: attacker,
      name: "Attacker",
      liquidCapital: 1e9,
      liquidCurrencyCode: "CAD",
      marketingStrength: 100,
    },
    { _id: defender, name: "Defender", liquidCapital: 200, marketingStrength: 0 },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: defender,
      countryId: "CA",
      stateId: "ON",
      sectorType: "agriculture",
      plantCount: 10,
      capitalStock: 1000,
      capacityBookAnchor: 1e6,
    },
  ]);
  const args = {
    attacker: { _id: attacker },
    defender: { _id: defender },
    targetSector: { sectorType: "agriculture" as const },
    targetSectorId: sectorId,
    stateId: "ON",
    countryId: "CA" as const,
    currentTurn: 25,
    attackerFxRate: 1.4,
    attackerCurrencyCode: "CAD" as const,
    randomRoll: 0,
  };
  return { db, memory, attacker, defender, sectorId, args };
}

describe("plant split settlement", () => {
  it.each(["corporations", "corporateSectors"])(
    "rolls back a landed %s write before retry",
    async (name) => {
      const w = world(),
        collection = w.memory.collection(name);
      const original = collection.updateOne.bind(collection);
      const fault = vi.spyOn(collection, "updateOne").mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("landed split failure");
      });
      await expect(attemptPlantSectorSplit(w.db, w.args)).rejects.toThrow("landed split failure");
      expect(
        (await w.memory.collection("corporations").findOne({ _id: w.attacker }))?.liquidCapital
      ).toBe(1e9);
      expect(
        (await w.memory.collection("corporateSectors").findOne({ _id: w.sectorId }))?.plantCount
      ).toBe(10);
      fault.mockRestore();
      expect((await attemptPlantSectorSplit(w.db, w.args)).ok).toBe(true);
      const sites = await w.memory.collection("corporateSectors").find({}).toArray();
      expect(sites.reduce((sum, row) => sum + Number(row.plantCount), 0)).toBe(10);
      expect(sites.reduce((sum, row) => sum + Number(row.capacityBookAnchor), 0)).toBe(1e6);
      expect(sites.reduce((sum, row) => sum + Number(row.capitalStock), 0)).toBe(1000);
    }
  );

  it("restores the donor and fee when receiver creation fails", async () => {
    const w = world(),
      collection = w.memory.collection("corporateSectors");
    const original = collection.insertOne.bind(collection);
    vi.spyOn(collection, "insertOne").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("landed receiver failure");
    });
    await expect(attemptPlantSectorSplit(w.db, w.args)).rejects.toThrow("landed receiver failure");
    expect(await collection.countDocuments({})).toBe(1);
    expect((await collection.findOne({ _id: w.sectorId }))?.capitalStock).toBe(1000);
    expect(
      (await w.memory.collection("corporations").findOne({ _id: w.attacker }))?.liquidCapital
    ).toBe(1e9);
  });

  it.each(["constructionFinancing", "constructionPropertyTransition"])(
    "rejects protected %s before charging",
    async (field) => {
      const w = world();
      await w.memory.collection("corporateSectors").updateOne(
        { _id: w.sectorId },
        {
          $set: {
            [field]:
              field === "constructionFinancing"
                ? { status: "active", escrowLocal: 10 }
                : { key: "held", kind: "sale" },
          },
        }
      );
      expect(await attemptPlantSectorSplit(w.db, w.args)).toMatchObject({ ok: false, status: 409 });
      expect(
        (await w.memory.collection("corporations").findOne({ _id: w.attacker }))?.liquidCapital
      ).toBe(1e9);
    }
  );

  it("commits autonomous cooldowns with the fee and capacity, including overlapping retries", async () => {
    const w = world(),
      args = { ...w.args, autonomous: true };
    const results = await Promise.all([
      attemptPlantSectorSplit(w.db, args),
      attemptPlantSectorSplit(w.db, args),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const winner = results.find((result) => result.ok);
    expect(
      winner?.ok &&
        (await w.memory.collection("corporations").findOne({ _id: w.attacker }))?.liquidCapital
    ).toBe(winner?.ok ? 1e9 - winner.resolution.attackCostLocal : 0);
    expect((await attemptPlantSectorSplit(w.db, args)).ok).toBe(false);
    expect(
      (await w.memory.collection("corporations").findOne({ _id: w.defender }))?.lastAutoAttackedTurn
    ).toBe(25);
  });
});
