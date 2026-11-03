import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb, type MockCollection } from "@/lib/test-utils/mockDb";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { getDefaultLegislativePriorities } from "@/lib/demographics/legislativePriorities/profile";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { createAdminLog } from "@/lib/adminLog";
import { GET, PUT, DELETE } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));

const target = { countryId: "US", regionId: "CA", bucketId: "age:young" };
const defaults = getDefaultLegislativePriorities("US", "CA", "age:young")!;
const selection = {
  primary: {
    lawTypeId: defaults.secondary[0].lawTypeId,
    policyOptionId: defaults.secondary[0].policyOptionId,
  },
  secondary: [defaults.primary, defaults.secondary[1], defaults.secondary[2]].map(
    ({ lawTypeId, policyOptionId }) => ({ lawTypeId, policyOptionId })
  ),
};
function request(method: string, body?: unknown) {
  return new Request(
    "http://localhost/api/admin/electorate-priorities" +
      (method === "GET" ? `?${new URLSearchParams(target)}` : ""),
    {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    }
  );
}

describe("admin electorate priorities API", () => {
  let db: MockDb;
  let overrides: MockCollection;
  let laws: MockCollection;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    overrides = db.collection("electoratePriorityOverrides");
    laws = db.collection("legislationTypes");
    laws.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(legislationTypes.filter((l) => l.countryScope === "us")),
    });
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { username: "test-admin" },
    } as never);
  });

  it.each([GET, PUT, DELETE])("denies non-admins before any database access", async (handler) => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    expect((await handler(request("GET"))).status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
    expect(overrides.replaceOne).not.toHaveBeenCalled();
    expect(overrides.deleteOne).not.toHaveBeenCalled();
  });

  it("returns exact live law options, saved requests and defaults only to an admin", async () => {
    overrides.findOne.mockResolvedValue({ priorities: selection });
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isOverride).toBe(true);
    expect(body.priorities.primary.lawTypeId).toBe(selection.primary.lawTypeId);
    expect(body.defaults.primary.lawTypeId).toBe(defaults.primary.lawTypeId);
    expect(body.laws.every((l: { countryScope: string }) => l.countryScope === "us")).toBe(true);
    expect(overrides.findOne).toHaveBeenCalledWith({ _id: "US:CA:age:young" });
    expect(laws.find).toHaveBeenCalledWith(
      { countryScope: "us" },
      expect.objectContaining({
        projection: expect.objectContaining({ "policyOptions.id": 1, "policyOptions.name": 1 }),
      })
    );
  });

  it("atomically saves four references to the region/group key and records the actor", async () => {
    const response = await PUT(request("PUT", { ...target, priorities: selection }));
    expect(response.status).toBe(200);
    expect(overrides.replaceOne).toHaveBeenCalledWith(
      { _id: "US:CA:age:young" },
      {
        _id: "US:CA:age:young",
        ...target,
        priorities: selection,
        updatedAt: expect.any(Date),
        updatedBy: "test-admin",
      },
      { upsert: true }
    );
    expect(createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "demographics_updated", adminUsername: "test-admin" })
    );
    const body = await response.json();
    expect(body.priorities.primary.policyOptionName).toBe(defaults.secondary[0].policyOptionName);
  });

  it.each([
    ["UK", "SCO"],
    ["JP", "KAN"],
  ])("saves country-specific levels in %s", async (countryId, regionId) => {
    const countryDefaults = getDefaultLegislativePriorities(countryId, regionId, "age:young")!;
    const ref = ({ lawTypeId, policyOptionId }: { lawTypeId: string; policyOptionId: string }) => ({
      lawTypeId,
      policyOptionId,
    });
    laws.find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue(
          legislationTypes.filter((l) => l.countryScope === countryId.toLowerCase())
        ),
    });
    expect(
      (
        await PUT(
          request("PUT", {
            countryId,
            regionId,
            bucketId: "age:young",
            priorities: {
              primary: ref(countryDefaults.primary),
              secondary: countryDefaults.secondary.map(ref),
            },
          })
        )
      ).status
    ).toBe(200);
    expect(overrides.replaceOne).toHaveBeenCalledWith(
      { _id: `${countryId}:${regionId}:age:young` },
      expect.any(Object),
      { upsert: true }
    );
  });

  it.each([
    { ...target, countryId: "DE" },
    { ...target, regionId: "SCO" },
    { ...target, bucketId: "urbanization:urban" },
    { ...target, bucketId: "income:low" },
    { ...target, bucketId: "age:missing" },
  ])("rejects an invalid country, region or group without writing", async (invalidTarget) => {
    expect((await PUT(request("PUT", { ...invalidTarget, priorities: selection }))).status).toBe(
      400
    );
    expect(overrides.replaceOne).not.toHaveBeenCalled();
  });

  it.each([
    { ...selection, secondary: selection.secondary.slice(0, 2) },
    { ...selection, secondary: [...selection.secondary, selection.secondary[0]] },
    { ...selection, primary: { ...selection.primary, policyOptionId: "missing" } },
    { ...selection, primary: { lawTypeId: "jp_pension", policyOptionId: "jp_pension_opt_2" } },
    { ...selection, primary: selection.secondary[0] },
    {
      ...selection,
      primary: {
        lawTypeId: selection.primary.lawTypeId,
        policyOptionId: defaults.primary.policyOptionId,
      },
    },
  ])(
    "rejects missing/extra secondary slots, foreign laws, wrong levels and duplicate laws",
    async (priorities) => {
      expect((await PUT(request("PUT", { ...target, priorities }))).status).toBe(400);
      expect(overrides.replaceOne).not.toHaveBeenCalled();
      expect(createAdminLog).not.toHaveBeenCalled();
    }
  );

  it("rejects malformed JSON", async () => {
    expect(
      (
        await PUT(
          new Request("http://localhost/api/admin/electorate-priorities", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "{",
          })
        )
      ).status
    ).toBe(400);
    expect(overrides.replaceOne).not.toHaveBeenCalled();
  });

  it("restores only the requested group to defaults", async () => {
    const response = await DELETE(request("DELETE", target));
    expect(response.status).toBe(200);
    expect(overrides.deleteOne).toHaveBeenCalledWith({ _id: "US:CA:age:young" });
    expect(await response.json()).toEqual({ priorities: defaults, isOverride: false });
  });

  it("denies invalid reset targets and reports database failures", async () => {
    expect((await DELETE(request("DELETE", { ...target, regionId: "UNKNOWN" }))).status).toBe(400);
    expect(overrides.deleteOne).not.toHaveBeenCalled();
    overrides.replaceOne.mockRejectedValue(new Error("test storage failure"));
    expect((await PUT(request("PUT", { ...target, priorities: selection }))).status).toBe(500);
  });
});
