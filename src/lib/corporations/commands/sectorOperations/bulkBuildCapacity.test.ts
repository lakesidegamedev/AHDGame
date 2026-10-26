import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createAsyncIterableCursor, createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { placeCapacityBuild, type CapacityBuildOutcome } from "./buildCapacity";
import { bulkBuildCapacity } from "./bulkBuildCapacity";
import { POST } from "@/app/api/corporations/[id]/sectors/bulk-build/route";

/**
 * The bulk command must route every sector through the single-sector build
 * path (`placeCapacityBuild`), so that path is mocked here and the tests pin
 * what the bulk layer adds: selection, the cap, the preview plan, and the
 * stop when cash or the confirmed total runs out.
 */

vi.mock("./buildCapacity", () => ({ placeCapacityBuild: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemMode: vi.fn().mockResolvedValue("plants"),
  isMarketSystemMode: (m: string) => typeof m === "string",
  marketAtLeast: vi.fn().mockReturnValue(true),
}));

const CORP_ID = new ObjectId();
let db: MockDb;
let corporation: Record<string, unknown>;

function sector(stateId: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(),
    corporationId: CORP_ID,
    countryId: "US",
    stateId,
    sectorType: "energy",
    capitalStock: 1000,
    ...overrides,
  };
}

function wire(sectors: Array<Record<string, unknown>>) {
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user: { userId: "u1" } } as never);
  vi.mocked(resolveCorporation).mockResolvedValue({ ok: true, corporation } as never);
  db.collectionMocks.corporateSectors.find.mockImplementation(
    (filter: { _id?: { $in: ObjectId[] } }) => {
      const ids = filter._id?.$in?.map((id) => id.toHexString());
      return createAsyncIterableCursor(
        ids ? sectors.filter((s) => ids.includes((s._id as ObjectId).toHexString())) : sectors
      );
    }
  );
  // The live balance: the apply loop re-reads it before every order.
  db.collectionMocks.corporations.findOne.mockImplementation(async () => ({ ...corporation }));
}

function quote(costLocal: number, queueFull = false): CapacityBuildOutcome {
  return {
    ok: true,
    status: 200,
    body: { success: true, preview: true, totalCostLocal: costLocal },
    chargedLocal: 0,
    queueFull,
  };
}

/** A fake build path: quotes `costs[stateId]`, and on a real order debits the corp. */
function fakeBuildPath(costs: Record<string, number>) {
  vi.mocked(placeCapacityBuild).mockImplementation(async (_db, input) => {
    const cost = costs[input.sector.stateId as string];
    if (input.preview) return quote(cost);
    if ((corporation.liquidCapital as number) < cost)
      return { ok: false, status: 400, code: "insufficient_cash", error: "Not enough cash" };
    corporation.liquidCapital = (corporation.liquidCapital as number) - cost;
    return { ok: true, status: 201, body: { success: true }, chargedLocal: cost, queueFull: false };
  });
}

function call(body: unknown) {
  return bulkBuildCapacity(
    new Request("http://localhost/api/corporations/1/sectors/bulk-build", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: CORP_ID.toHexString() }) }
  );
}

describe("bulkBuildCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("corporateSectors");
    db.collection("corporations");
    corporation = {
      _id: CORP_ID,
      name: "Gridco",
      countryId: "US",
      liquidCapital: 100,
      liquidCurrencyCode: "USD",
    };
  });

  it("is wired to the route", () => {
    expect(typeof POST).toBe("function");
  });

  it("previews every sector through the single-sector quote and marks what the cash covers", async () => {
    const sectors = [
      sector("US-AL"),
      sector("US-CA", { mothballed: true }),
      sector("US-NY"),
      sector("US-TX"),
    ];
    wire(sectors);
    fakeBuildPath({ "US-AL": 60, "US-NY": 30, "US-TX": 30 });

    const res = await call({ rule: { kind: "facilities", count: 1 }, mode: "preview" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.rows.map((r: { stateId: string; status: string }) => [r.stateId, r.status])
    ).toEqual([
      ["US-AL", "ready"],
      ["US-CA", "blocked"],
      ["US-NY", "ready"],
      ["US-TX", "over_budget"],
    ]);
    expect(json.readyCount).toBe(2);
    expect(json.readyCostLocal).toBe(90);
    expect(json.rows[1].reason).toMatch(/Mothballed/);
    // Every quote is a preview through the shared path; nothing is charged.
    expect(placeCapacityBuild).toHaveBeenCalledTimes(3);
    for (const [, input] of vi.mocked(placeCapacityBuild).mock.calls) {
      expect(input.preview).toBe(true);
      expect(input.userId).toBe("u1");
    }
  });

  it("reports a full build queue and a refusal from the build path as blocked", async () => {
    wire([sector("US-AL"), sector("US-CA")]);
    vi.mocked(placeCapacityBuild).mockResolvedValueOnce(quote(10, true)).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "blocked",
      error: "Unlist this sector",
    });
    const json = await (
      await call({ rule: { kind: "percent", percent: 10 }, mode: "preview" })
    ).json();
    expect(json.rows.map((r: { status: string }) => r.status)).toEqual(["blocked", "blocked"]);
    expect(json.rows[0].reason).toMatch(/Too many builds/);
    expect(json.rows[1].reason).toBe("Unlist this sector");
    expect(json.readyCount).toBe(0);
  });

  it("applies one sector at a time and stops spending when the cash runs out", async () => {
    wire([
      sector("US-AL"),
      sector("US-CA", { mothballed: true }),
      sector("US-NY"),
      sector("US-TX"),
    ]);
    fakeBuildPath({ "US-AL": 60, "US-NY": 50, "US-TX": 10 });

    const json = await (
      await call({ rule: { kind: "facilities", count: 2 }, mode: "apply" })
    ).json();

    expect(
      json.rows.map((r: { stateId: string; status: string }) => [r.stateId, r.status])
    ).toEqual([
      ["US-AL", "built"],
      ["US-CA", "skipped"],
      ["US-NY", "skipped"],
      // Affordable on its own, but spending stops at the first sector the cash
      // cannot cover, matching the preview.
      ["US-TX", "skipped"],
    ]);
    expect(json.builtCount).toBe(1);
    expect(json.spentLocal).toBe(60);
    expect(corporation.liquidCapital).toBe(40);
    const orders = vi.mocked(placeCapacityBuild).mock.calls.filter(([, i]) => !i.preview);
    expect(orders).toHaveLength(1);
  });

  it("never spends past the total the CEO confirmed", async () => {
    corporation.liquidCapital = 1000;
    wire([sector("US-AL"), sector("US-NY")]);
    fakeBuildPath({ "US-AL": 60, "US-NY": 50 });
    const json = await (
      await call({ rule: { kind: "facilities", count: 1 }, mode: "apply", maxTotalLocal: 100 })
    ).json();
    expect(json.rows.map((r: { status: string }) => r.status)).toEqual(["built", "skipped"]);
    expect(json.rows[1].reason).toMatch(/confirmed/);
    expect(json.spentLocal).toBe(60);
  });

  it("stops when the build path's own balance guard refuses an order", async () => {
    corporation.liquidCapital = 1000;
    wire([sector("US-AL"), sector("US-NY")]);
    vi.mocked(placeCapacityBuild).mockImplementation(async (_db, input) =>
      input.preview
        ? quote(10)
        : { ok: false, status: 400, code: "insufficient_cash", error: "Not enough cash" }
    );
    const json = await (
      await call({ rule: { kind: "facilities", count: 1 }, mode: "apply" })
    ).json();
    expect(json.rows.map((r: { status: string }) => r.status)).toEqual(["skipped", "skipped"]);
    // The second sector is never attempted after the first refusal.
    expect(vi.mocked(placeCapacityBuild).mock.calls.filter(([, i]) => !i.preview)).toHaveLength(1);
  });

  it("filters by country and sector type", async () => {
    wire([
      sector("US-AL"),
      sector("US-CA", { sectorType: "retail" }),
      sector("GB-ENG", { countryId: "GB" }),
    ]);
    fakeBuildPath({ "US-AL": 1 });
    const json = await (
      await call({
        countryId: "US",
        sectorType: "energy",
        rule: { kind: "facilities", count: 1 },
        mode: "preview",
      })
    ).json();
    expect(json.rows.map((r: { stateId: string }) => r.stateId)).toEqual(["US-AL"]);
  });

  it("refuses a selection over the per-request cap", async () => {
    wire(Array.from({ length: 51 }, (_, i) => sector(`US-${String(i).padStart(2, "0")}`)));
    const res = await call({ rule: { kind: "facilities", count: 1 }, mode: "preview" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/51 sectors/);
    expect(placeCapacityBuild).not.toHaveBeenCalled();
  });

  it("is CEO only and refuses NPP-run corporations", async () => {
    wire([sector("US-AL")]);
    vi.mocked(requireCeo).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Only the CEO" }), { status: 403 }) as never
    );
    expect((await call({ rule: { kind: "facilities", count: 1 }, mode: "preview" })).status).toBe(
      403
    );
    corporation.ceoType = "npp";
    expect((await call({ rule: { kind: "facilities", count: 1 }, mode: "apply" })).status).toBe(
      403
    );
    expect(placeCapacityBuild).not.toHaveBeenCalled();
  });
});
