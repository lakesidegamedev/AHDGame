/**
 * Regression test for ticket #0869 — past decades must never lane-lock,
 * regardless of what the corp committed while the decade was current. This
 * is confirmed intended behavior straight from the ticket thread: "that's
 * intended you can only pick one per active decade" and "Only the current
 * and previous decade apply effects" — a past decade's per-turn stat bonuses
 * are already inert (see getSectorTechEffectsForYear), so locking the
 * opposite lane there would only block a no-op. The actual ask in that
 * thread was a UI clarity fix (blur/label on inert history decades in
 * TechTab.tsx), not a lock-enforcement change.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { TECH_TREE } from "@/lib/constants/techTree";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({ resolveCorporation: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/corporations/dailyGrossRevenue", () => ({
  corpDailyGrossRevenuePricingLocal: vi.fn().mockResolvedValue({
    dailyGrossRevenueLocal: 2_635_025_293.53,
    capacityFloorApplied: true,
    techCashFloorLocal: 4_900_000,
  }),
}));

let db: MockDb;
const corpId = new ObjectId();

function makeCorp(overrides: Record<string, unknown> = {}) {
  return {
    _id: corpId,
    type: "financial",
    isPrivate: false,
    ceoVacant: false,
    userId: new ObjectId(),
    unlockedTechNodeIds: [],
    techDecadeLane: {},
    rdScore: 0,
    liquidCapital: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("corporateSectors").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
  });

  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);

  const { getGameState } = await import("@/lib/gameState");
  // currentYear 2000 puts the 1979-1989 bracket well into the past.
  vi.mocked(getGameState).mockResolvedValue({
    currentTurn: 1,
    startingYear: 2000,
    currentYear: 2000,
  } as never);
});

describe("GET /api/corporation/[id]/tech", () => {
  it.each([false, true])(
    "shows tiered unlock years by operating country (foreign operator: %s)",
    async (foreignOperator) => {
      const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
      const { getGameState } = await import("@/lib/gameState");
      vi.mocked(getGameState).mockResolvedValue({
        currentYear: 2032,
        startingYear: 2027,
        currentTurn: 240,
        preset: "2027-default",
      } as never);
      const node = TECH_TREE.logistics.find(
        (candidate) => candidate.name === "Autonomous Freight"
      )!;
      vi.mocked(resolveCorporation).mockResolvedValue({
        ok: true,
        corporation: makeCorp({
          type: "logistics",
          countryId: "CA",
          unlockedTechNodeIds: [node.id],
        }),
      } as never);
      const sectors = db.collection("corporateSectors");
      sectors.distinct.mockResolvedValue(["US"]);
      sectors.aggregate.mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue(
            foreignOperator ? [{ _id: { strategyId: "autonomous_freight", countryId: "US" } }] : []
          ),
      });

      const { GET } = await import("./route");
      const response = await GET(new Request("http://localhost/api/corporation/x/tech"), {
        params: Promise.resolve({ id: corpId.toString() }),
      });
      const body = await response.json();
      const decade = body.decades.find((entry: { id: string }) => entry.id === "2029");
      const owned = decade.lanes.sector.find((entry: { id: string }) => entry.id === node.id);
      expect(owned.owned).toBe(true);
      expect(owned.effects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            licensingYears: 3,
            methodOpenings: [
              { countryId: "CA", year: foreignOperator ? 2033 : 2036, open: false },
              { countryId: "US", year: 2036, open: false },
            ],
          }),
        ])
      );
    }
  );

  it("explains the gross operating scale used to price technology", async () => {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: makeCorp(),
    } as never);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
      params: Promise.resolve({ id: corpId.toString() }),
    });
    const body = await res.json();

    expect(body.cashPricing).toEqual({
      dailyGrossOperatingScale: 2_635_025_294,
      defaultRevenueFraction: 0.05,
      capacityFloorApplied: true,
      minimumCashCost: 4_900_000,
      // A node with a running value pays at least a tenth of the floor.
      valuedMinimumCashCost: 490_000,
    });
  });

  it("does not lock either lane in a past decade the corp committed a lane in (ticket #0869)", async () => {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: makeCorp({
        techDecadeLane: { "1979": "generic" },
        unlockedTechNodeIds: ["corp-1979-1"],
      }),
    } as never);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
      params: Promise.resolve({ id: corpId.toString() }),
    });
    const body = await res.json();

    const decade1979 = body.decades.find((d: { id: string }) => d.id === "1979");
    expect(decade1979).toBeDefined();
    // Past decades never surface a commitment — both lanes are free to browse.
    expect(decade1979.committedLane).toBeNull();
    expect(decade1979.autoGrantedDecade).toBe(true);

    const sectorRoot = decade1979.lanes.sector.find(
      (n: { id: string }) => n.id === "financial-1979-1"
    );
    expect(sectorRoot.laneLocked).toBe(false);

    const genericRoot = decade1979.lanes.generic.find(
      (n: { id: string }) => n.id === "corp-1979-1"
    );
    expect(genericRoot.laneLocked).toBe(false);
    expect(genericRoot.autoGranted).toBe(true);
  });

  it("does not lock either lane in a past decade the corp never touched", async () => {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: makeCorp({ techDecadeLane: {}, unlockedTechNodeIds: [] }),
    } as never);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
      params: Promise.resolve({ id: corpId.toString() }),
    });
    const body = await res.json();

    const decade1979 = body.decades.find((d: { id: string }) => d.id === "1979");
    expect(decade1979.committedLane).toBeNull();
    expect(decade1979.autoGrantedDecade).toBe(true);

    const genericRoot = decade1979.lanes.generic.find(
      (n: { id: string }) => n.id === "corp-1979-1"
    );
    const sectorRoot = decade1979.lanes.sector.find(
      (n: { id: string }) => n.id === "financial-1979-1"
    );
    expect(genericRoot.laneLocked).toBe(false);
    expect(sectorRoot.laneLocked).toBe(false);
  });

  it("marks the specialization tier of a completed decade closed on both tracks (ticket 1606)", async () => {
    const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: makeCorp({ techDecadeLane: {}, unlockedTechNodeIds: [] }),
    } as never);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
      params: Promise.resolve({ id: corpId.toString() }),
    });
    const body = await res.json();

    const decade1979 = body.decades.find((d: { id: string }) => d.id === "1979");
    expect(decade1979.autoGrantedDecade).toBe(true);

    for (const lane of ["generic", "sector"] as const) {
      const baseline = decade1979.lanes[lane].find((n: { slot: number }) => n.slot === 9);
      const specialization = decade1979.lanes[lane].find((n: { slot: number }) => n.slot === 10);
      expect(baseline.tierClosed, `${lane} baseline`).toBe(false);
      expect(specialization.tierClosed, `${lane} specialization`).toBe(true);
      expect(specialization.affordable, `${lane} specialization affordable`).toBe(false);
      // A completed decade is not lane-locked: it is closed as a completed decade.
      expect(specialization.laneLocked, `${lane} specialization laneLocked`).toBe(false);
    }
  });

  describe("private subsidiary visibility (ticket 1529)", () => {
    const parentId = new ObjectId();
    const parentCeoUserId = new ObjectId();

    function privateSub() {
      return makeCorp({
        isPrivate: true,
        totalShares: 1000,
        rdScore: 42,
        rdBudget: 500,
        shareholders: [{ corporationId: parentId, shares: 1000 }],
      });
    }

    async function getAs(userId: ObjectId | null, parentDoc: Record<string, unknown> | null) {
      const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
      vi.mocked(resolveCorporation).mockResolvedValue({
        ok: true,
        corporation: privateSub(),
      } as never);
      const { getAuthUser } = await import("@/lib/auth");
      vi.mocked(getAuthUser).mockResolvedValue(
        (userId ? { userId: userId.toString(), isAdmin: false } : null) as never
      );
      db.collection("corporations").findOne.mockResolvedValue(parentDoc as never);
      const { GET } = await import("./route");
      const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
        params: Promise.resolve({ id: corpId.toString() }),
      });
      return res.json();
    }

    it("shows the tech book read-only to the controlling parent's CEO", async () => {
      const body = await getAs(parentCeoUserId, {
        _id: parentId,
        userId: parentCeoUserId,
        ceoVacant: false,
      });
      expect(body.redacted).toBe(false);
      expect(body.isCeo).toBe(false);
      expect(body.rdBudget).toBe(500);
      for (const decade of body.decades ?? []) {
        for (const node of [...decade.lanes.generic, ...decade.lanes.sector]) {
          expect(node.affordable).toBe(false);
        }
      }
    });

    it("keeps redacting for an unrelated viewer", async () => {
      const body = await getAs(new ObjectId(), {
        _id: parentId,
        userId: parentCeoUserId,
        ceoVacant: false,
      });
      expect(body.redacted).toBe(true);
      expect(body.rdBudget).toBeNull();
    });

    it("keeps redacting when the parent's CEO seat is vacant", async () => {
      const body = await getAs(parentCeoUserId, {
        _id: parentId,
        userId: parentCeoUserId,
        ceoVacant: true,
      });
      expect(body.redacted).toBe(true);
    });

    it("keeps redacting for anonymous viewers", async () => {
      const body = await getAs(null, null);
      expect(body.redacted).toBe(true);
    });
  });
  describe("era baseline (gameConfig.legacyTechMode)", () => {
    // A 2027 world: the 2009 decade is the previous one, so its nodes still apply
    // per turn, but they are pre-start-decade tech.
    const eraNode = TECH_TREE.financial.find(
      (n) =>
        n.decadeId === "2009" &&
        n.lane === "sector" &&
        n.effects.some((e) => e.kind === "plantOutput" || e.kind === "inputEfficiency")
    );

    async function fetchTech(legacyTechMode?: string) {
      const { getGameState } = await import("@/lib/gameState");
      vi.mocked(getGameState).mockResolvedValue({
        currentTurn: 1,
        startingYear: 2027,
        currentYear: 2027,
      } as never);
      db.collection("gameConfig").findOne.mockResolvedValue(
        legacyTechMode ? { _id: "default", legacyTechMode } : null
      );
      const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
      vi.mocked(resolveCorporation).mockResolvedValue({
        ok: true,
        corporation: makeCorp({ unlockedTechNodeIds: eraNode ? [eraNode.id] : [] }),
      } as never);
      const { GET } = await import("./route");
      const res = await GET(new Request("http://localhost/api/corporation/x/tech"), {
        params: Promise.resolve({ id: corpId.toString() }),
      });
      return res.json();
    }

    it("has an era node to test with", () => {
      expect(eraNode).toBeDefined();
    });

    it("counts nothing from earlier decades when the mode is absent", async () => {
      const body = await fetchTech();
      expect(body.eraBaseline).toEqual({ plantOutputPct: 0, inputEfficiencyPct: 0 });
      expect(body.plantOutputPct).toBe(0);
      expect(body.inputEfficiencyPct).toBe(0);
      const node = body.decades
        .flatMap((d: { lanes: { sector: { id: string }[] } }) => d.lanes.sector)
        .find((n: { id: string }) => n.id === eraNode?.id);
      expect(node.owned).toBe(true);
      expect(node.valuePerTurn).toBeNull();
      expect(node.inputEfficiencyContributionPct).toBe(0);
    });

    it("reports earlier-decade tech on its own line and leaves the research numbers at zero in baseline mode", async () => {
      const body = await fetchTech("baseline");
      expect(body.eraBaseline.plantOutputPct + body.eraBaseline.inputEfficiencyPct).toBeGreaterThan(
        0
      );
      expect(body.plantOutputPct).toBe(0);
      expect(body.inputEfficiencyPct).toBe(0);
    });
  });
});
