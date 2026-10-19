import { describe, expect, it, vi } from "vitest";
import { buildOpeningMetricSnapshots1991 } from "@/lib/resetMetrics/seedOpening1991";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: () => ({
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    }),
  }),
}));
vi.mock("@/lib/resetMetrics/readBoard", () => ({ readResetMetricBoard: vi.fn() }));
vi.mock("@/lib/resetMetrics/readNationalRollup", () => ({
  readNationalMetricRollup: vi.fn(),
}));
vi.mock("@/lib/resetMetrics/readGovernanceStyle", () => ({
  readResetGovernanceStyle: vi.fn().mockResolvedValue(null),
}));

describe("v2 metrics API", () => {
  it("uses the same dated funding evidence as the turn, rather than granting a missing settlement full effect", async () => {
    const { getDb } = await import("@/lib/mongodb");
    const { readResetMetricBoard } = await import("@/lib/resetMetrics/readBoard");
    const { GET } = await import("./route");
    const db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const board = buildOpeningMetricSnapshots1991("world", 1).find((b) => b._id === "US:CA")!;
    board.asOfTurn = 10;
    vi.mocked(readResetMetricBoard).mockResolvedValue({ status: "ready", board });
    const program = {
      _id: "law",
      country: "US",
      scope: "regional",
      regionId: "CA",
      familyId: "L25",
      choice: "center",
      titleSnapshot: "Road funding",
      fundingAccountId: "regional_budget",
      effectiveTurn: 2,
      annualAgencyAllocation: 100,
      primaryMetricEffects: [{ metricId: "26", favorableNormalizedPoints: 0.8 }],
    };
    db.collection("resetLawPrograms").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([program]),
    });
    const read = async () => {
      const response = await GET(
        new Request("http://localhost/api/country/us/reset-metrics?region=CA"),
        { params: Promise.resolve({ code: "us" }) }
      );
      expect(response.status).toBe(200);
      return (await response.json()).metrics.find((m: { id: string }) => m.id === "26")
        .legislativeEffect;
    };
    expect(await read()).toBeNull();
    const paid = {
      _id: "CA",
      countryId: "US",
      regionalProgramSettlements: {
        law: { implementationFactor: 1, lastSettledTurn: 9, validThroughTurn: 9 },
      },
    };
    db.collection("stateBudgets").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([paid]),
    });
    expect(await read()).toBeNull();
    paid.regionalProgramSettlements.law.validThroughTurn = 10;
    expect(await read()).toMatchObject({ favorableNormalizedPoints: 0.8 });
    program.effectiveTurn = 11;
    expect(await read()).toBeNull();
  });
  it("does not expose a staged or unavailable board as live data", async () => {
    const { readResetMetricBoard } = await import("@/lib/resetMetrics/readBoard");
    const { GET } = await import("./route");
    vi.mocked(readResetMetricBoard).mockResolvedValue({ status: "not_enabled" });
    const request = new Request("http://localhost/api/country/us/reset-metrics");
    const context = { params: Promise.resolve({ code: "us" }) };
    expect((await GET(request, context)).status).toBe(409);
    vi.mocked(readResetMetricBoard).mockResolvedValue({ status: "stale" });
    const stale = await GET(request, context);
    expect(stale.status).toBe(503);
    expect((await stale.json()).reason).toBe("stale");
  });

  it("returns all 58 national primaries with descriptions and source labels", async () => {
    const { readResetMetricBoard } = await import("@/lib/resetMetrics/readBoard");
    const { readNationalMetricRollup } = await import("@/lib/resetMetrics/readNationalRollup");
    const boards = buildOpeningMetricSnapshots1991("world-test", 1);
    const board = boards.find((row) => row._id === "US:national")!;
    const regional = boards.find((row) => row.countryId === "US" && row.scope === "regional")!;
    vi.mocked(readResetMetricBoard).mockResolvedValue({ status: "ready", board });
    vi.mocked(readNationalMetricRollup).mockResolvedValue({
      ...regional.observations,
      ...board.observations,
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/country/us/reset-metrics"), {
      params: Promise.resolve({ code: "us" }),
    });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(payload.metrics).toHaveLength(58);
    expect(payload).toHaveProperty("governanceStyle", null);
    expect(payload.metrics[0]).toMatchObject({
      description: expect.any(String),
      observation: { source: expect.any(String), owner: expect.any(String), lastUpdatedTurn: 1 },
      refresh: "1",
      conditionScore: expect.any(Number),
    });
  });

  it("fails closed when the regional national rollup is incomplete", async () => {
    const { readResetMetricBoard } = await import("@/lib/resetMetrics/readBoard");
    const { readNationalMetricRollup } = await import("@/lib/resetMetrics/readNationalRollup");
    const board = buildOpeningMetricSnapshots1991("world-test", 1).find(
      (row) => row._id === "US:national"
    )!;
    vi.mocked(readResetMetricBoard).mockResolvedValue({ status: "ready", board });
    vi.mocked(readNationalMetricRollup).mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/country/us/reset-metrics"), {
      params: Promise.resolve({ code: "us" }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("regional_rollup");
  });
});
