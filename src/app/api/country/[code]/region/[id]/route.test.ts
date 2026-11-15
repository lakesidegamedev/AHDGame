import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getDb } from "@/lib/mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const db = createMockDb();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});
it.each(["NT", "CA_NT", "nt"])(
  "resolves %s to the existing Canadian region without changing its stored ID",
  async (id) => {
    db.collection("states").findOne.mockResolvedValue({
      _id: "CA_NT",
      countryId: "CA",
      name: "Northwest Territories",
    });
    const response = await GET(new Request("http://localhost/api/country/ca/region/" + id), {
      params: Promise.resolve({ code: "ca", id }),
    });
    expect(response.status).toBe(200);
    expect(db.collection("states").findOne).toHaveBeenCalledWith({ _id: "CA_NT", countryId: "CA" });
    expect(await response.json()).toMatchObject({ _id: "CA_NT", countryId: "CA" });
  }
);
it("keeps California scoped to the US", async () => {
  db.collection("states").findOne.mockResolvedValue({
    _id: "CA",
    countryId: "US",
    name: "California",
  });
  const response = await GET(new Request("http://localhost/api/country/us/region/CA"), {
    params: Promise.resolve({ code: "us", id: "CA" }),
  });
  expect(response.status).toBe(200);
  expect(db.collection("states").findOne).toHaveBeenCalledWith({ _id: "CA", countryId: "US" });
});
