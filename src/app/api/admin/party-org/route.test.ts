import { beforeEach, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { PATCH } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
beforeEach(() =>
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin: { username: "admin" } } as never)
);
it.each([true, false])(
  "overrides organization without conflicting update paths, existing=%s",
  async (existing) => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("states", [{ _id: "TX", countryId: "US", name: "Texas" }]);
    f.memory.seed("politicalParties", [
      { _id: "party", sequentialId: 1, countryId: "US", name: "Party" },
    ]);
    if (existing)
      f.memory.seed("statePartyOrg", [
        { _id: "TX_1", organization: 20, organizationUnits: 100, treasury: 70 },
      ]);
    vi.mocked(getDb).mockResolvedValue(f.db);
    const col = f.memory.collection("statePartyOrg");
    const write = vi.spyOn(col, "updateOne");
    const response = await PATCH(
      new Request("http://localhost/api/admin/party-org", {
        method: "PATCH",
        body: JSON.stringify({ stateId: "TX", countryId: "US", partyId: "1", organization: 65 }),
      })
    );
    expect(response.status).toBe(200);
    const update = write.mock.calls[0][1] as {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };
    expect(Object.keys(update.$set).filter((key) => key in update.$setOnInsert)).toEqual([]);
    expect(col.docs[0].organization).toBe(65);
    expect(col.docs[0].organizationUnits).toBeUndefined();
    expect(col.docs[0].treasury).toBe(existing ? 70 : 0);
  }
);
