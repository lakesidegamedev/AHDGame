import { expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/mongodb";
import { getAllStateApprovalsForElection } from "./getStateApprovalForElection";
it("keeps two countries' identically named regions separate", async () => {
  const db = createInMemoryDb();
  db.seed("states", [
    { _id: "HB", countryId: "CN" },
    { _id: "HB", countryId: "DE" },
  ]);
  db.seed("stateApprovalHistory", [
    { _id: "CN:HB", stateId: "HB", countryId: "CN", approvalRating: 70, lastSnapshotTurn: 5 },
    { _id: "HB", stateId: "HB", countryId: "DE", approvalRating: 30, lastSnapshotTurn: 5 },
  ]);
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const all = await getAllStateApprovalsForElection();
  expect([...all]).toEqual([
    ["CN:HB", 70],
    ["DE:HB", 30],
  ]);
  const scoped = await getAllStateApprovalsForElection({ countryIds: ["DE"] });
  expect([...scoped]).toEqual([["HB", 30]]);
});
