import { it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { renameSector } from "./renameSector";
const h = vi.hoisted(() => ({ db: null as Db | null, userId: "", characterId: "" }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => h.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireBasicAuth: async () => ({
    ok: true,
    user: { userId: h.userId, activeCharacterId: h.characterId },
  }),
}));
it("refuses a rename if the sector changes owner between authorization and mutation", async () => {
  const f = createTransactionalMemoryDb();
  h.db = f.db;
  const corporationId = new ObjectId(),
    newOwner = new ObjectId(),
    sectorId = new ObjectId(),
    characterId = new ObjectId(),
    userId = new ObjectId();
  h.userId = String(userId);
  h.characterId = String(characterId);
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  f.memory.seed("corporations", [
    { _id: corporationId, countryId: "US", userId, ceoId: characterId },
  ]);
  f.memory.seed("corporateSectors", [{ _id: sectorId, corporationId, displayName: "Original" }]);
  const sectors = f.memory.collection("corporateSectors");
  const update = sectors.updateOne.bind(sectors);
  vi.spyOn(sectors, "updateOne").mockImplementationOnce(async (filter, change, options) => {
    await update({ _id: sectorId }, { $set: { corporationId: newOwner } });
    return update(filter, change, options);
  });
  const reply = await renameSector(
    new Request("https://test.invalid", {
      method: "POST",
      body: JSON.stringify({ displayName: "Stale rename" }),
    }),
    { params: Promise.resolve({ id: String(corporationId), sectorId: String(sectorId) }) }
  );
  expect(reply.status).toBe(409);
  expect((await sectors.findOne({ _id: sectorId }))!.displayName).toBe("Original");
});
