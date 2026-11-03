import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 50, startingYear: 1991 }),
}));
vi.mock("@/lib/uk/confidence/confidenceGaugeStore", () => ({
  getUkConfidenceErosionScale: vi.fn().mockReturnValue(1),
  tickConfidenceForGov: vi.fn().mockResolvedValue({
    value: 60,
    dissolutionDue: false,
    dissolutionEnabled: false,
  }),
}));
vi.mock("@/lib/uk/nhs/nhsStore", () => ({
  tickNhsFromBudget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/snapElection", () => ({ triggerSnapElection: vi.fn() }));
vi.mock("@/lib/countries/uk/manifesto/deliveryMeter", () => ({
  loadUkBrokenPromiseMeter: vi.fn().mockResolvedValue(0.25),
}));

let db: MockDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("governmentApprovals");
});

/**
 * #4354: the UK confidence card says broken pledges bleed confidence, but the
 * per-turn tick used to pass only approval and the erosion scale, so the bleed
 * never happened. This pins the wiring, not the arithmetic.
 */
describe("UK confidence tick", () => {
  it("passes the broken-promise meter into the confidence tick", async () => {
    db.collectionMocks["governmentApprovals"]!.findOne.mockResolvedValue({
      _id: "UK",
      approvalRating: 55,
      headOfGovernmentSinceTurn: 10,
    });

    const { tickUkGovernmentGauges } = await import("@/lib/countries/uk/governmentFormation");
    await tickUkGovernmentGauges(db as unknown as Db, new Date("2026-10-23T00:00:00Z"));

    const { tickConfidenceForGov } = await import("@/lib/uk/confidence/confidenceGaugeStore");
    expect(tickConfidenceForGov).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ approval: 55, brokenPromiseMeter: 0.25 })
    );
  });

  it("leaves the meter out when the government has no judgeable manifesto", async () => {
    db.collectionMocks["governmentApprovals"]!.findOne.mockResolvedValue({
      _id: "UK",
      approvalRating: 55,
      headOfGovernmentSinceTurn: 10,
    });
    const { loadUkBrokenPromiseMeter } = await import("@/lib/countries/uk/manifesto/deliveryMeter");
    vi.mocked(loadUkBrokenPromiseMeter).mockResolvedValue(undefined);

    const { tickUkGovernmentGauges } = await import("@/lib/countries/uk/governmentFormation");
    await tickUkGovernmentGauges(db as unknown as Db, new Date("2026-10-23T00:00:00Z"));

    const { tickConfidenceForGov } = await import("@/lib/uk/confidence/confidenceGaugeStore");
    const opts = vi.mocked(tickConfidenceForGov).mock.calls[0][1];
    expect(opts.brokenPromiseMeter).toBeUndefined();
  });
});

describe("confidence collapse while an election is running", () => {
  it.each([
    { status: "pending", pmCharacterId: null, pmNppId: null, expected: false },
    { status: "collapsed", pmCharacterId: "player", expected: false },
    { status: "formed", pmCharacterId: null, pmNppId: null, expected: false },
    { status: "formed", pmCharacterId: "player", expected: true },
    { status: "formed", pmCharacterId: null, pmNppId: "npp", expected: true },
  ])("only dissolves a seated government: %j", async ({ expected, ...government }) => {
    db.collectionMocks.governmentApprovals.findOne.mockResolvedValue({
      _id: "UK",
      approvalRating: 20,
    });
    db.collection("governmentFormations");
    db.collectionMocks.governmentFormations.findOne.mockResolvedValue({ _id: "UK", ...government });
    const { tickConfidenceForGov } = await import("@/lib/uk/confidence/confidenceGaugeStore");
    vi.mocked(tickConfidenceForGov).mockResolvedValue({
      value: 0,
      dissolutionDue: true,
      dissolutionEnabled: true,
    });
    const { tickUkGovernmentGauges } = await import("@/lib/countries/uk/governmentFormation");
    await tickUkGovernmentGauges(db as unknown as Db, new Date("2026-10-29"));
    const { triggerSnapElection } = await import("@/lib/turn/snapElection");
    expect(triggerSnapElection).toHaveBeenCalledTimes(expected ? 1 : 0);
    const { tickNhsFromBudget } = await import("@/lib/uk/nhs/nhsStore");
    expect(tickNhsFromBudget).toHaveBeenCalledTimes(1);
  });
});
