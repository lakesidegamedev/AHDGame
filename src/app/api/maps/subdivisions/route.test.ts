import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn().mockResolvedValue("1991-default"),
}));
vi.mock("@/lib/maps/subdivisionData", () => ({ loadSubdivisionFile: vi.fn() }));

import { GET } from "./route";

const call = (q: string) => GET(new NextRequest(`http://t/api/maps/subdivisions?${q}`));

beforeEach(async () => {
  const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
  vi.mocked(loadSubdivisionFile)
    .mockReset()
    .mockResolvedValue({
      viewBox: "0 0 10 10",
      subdivisions: [{ id: "46001", name: "Aurora", path: "M0,0Z", electorate: 10, leanScalar: 3 }],
    } as never);
});

describe("GET /api/maps/subdivisions", () => {
  it("serves a region's sub-unit shapes for a race type, with no tally needed", async () => {
    const res = await call("country=US&type=governor&region=SD");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdivisions).toEqual([{ id: "46001", name: "Aurora", path: "M0,0Z" }]);
    expect(body.unitLabelPlural).toBe("Counties");
    const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
    expect(loadSubdivisionFile).toHaveBeenCalledWith("counties", "SD", { preset: "1991-default" });
  });

  it("uses the race type's own geometry (US House districts)", async () => {
    await call("country=US&type=house&region=SD");
    const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
    expect(vi.mocked(loadSubdivisionFile).mock.calls[0][0]).toBe("congressional-districts");
  });

  it("404s a country or type with no sub-unit map, and rejects a malformed region", async () => {
    expect((await call("country=DE&type=bundestag&region=BY")).status).toBe(404);
    expect((await call("country=US&type=governor&region=../x")).status).toBe(400);
  });

  it("404s a region with no data file", async () => {
    const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
    vi.mocked(loadSubdivisionFile).mockResolvedValue(null);
    expect((await call("country=US&type=governor&region=ZZ")).status).toBe(404);
  });
});
