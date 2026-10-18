/**
 * Unit tests for processActionRefresh.
 * Mocks DB; verifies update logic for actions, influence, infamy, favorability.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Character, GameConfig } from "@/lib/db/types";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));
vi.mock("@/lib/api/headOfGovernment", () => ({
  getHeadOfGovernmentCharacterId: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/countryState", () => ({
  getCountryState: vi.fn(async (_db: unknown, countryId: string) => ({
    governmentType:
      countryId === "DD" || countryId === "RU" ? "parliamentaryRepublic" : "presidential",
  })),
}));

const roleFixtures = vi.hoisted(() => ({
  oppositionLeaderIds: new Set<string>(),
  shadowCabinetIds: new Set<string>(),
  presidingOfficers: [] as { characterId: unknown; role: string }[],
  statePartyChairIds: new Set<string>(),
  orgHeadIds: new Set<string>(),
  ceoCandidates: new Map<string, { corporationId: string; tier: "major" | "standard" }>(),
}));
vi.mock("./actionRefreshRoles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actionRefreshRoles")>();
  return {
    ...actual,
    loadOppositionRoles: vi.fn(async () => ({
      leaderIds: roleFixtures.oppositionLeaderIds,
      shadowCabinetIds: roleFixtures.shadowCabinetIds,
    })),
    loadPresidingOfficerRoles: vi.fn(async () => roleFixtures.presidingOfficers),
    loadStatePartyChairIds: vi.fn(async () => roleFixtures.statePartyChairIds),
    loadOrgHeadIds: vi.fn(async () => roleFixtures.orgHeadIds),
    loadCeoCandidates: vi.fn(async () => roleFixtures.ceoCandidates),
  };
});

type BulkOp = {
  updateOne: {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> } | Array<{ $set: Record<string, unknown> }>;
  };
};

function isPipelineUpdate(
  update: BulkOp["updateOne"]["update"]
): update is Array<{ $set: Record<string, unknown> }> {
  return Array.isArray(update);
}

function actionsGrantOp(ops: BulkOp[], id?: unknown): BulkOp {
  const op = ops.find(
    (candidate) =>
      isPipelineUpdate(candidate.updateOne.update) &&
      (id === undefined || candidate.updateOne.filter._id === id)
  );
  if (!op) throw new Error("missing actions grant pipeline op");
  return op;
}

function fieldsSet(ops: BulkOp[], id?: unknown): Record<string, unknown> {
  const op = ops.find(
    (candidate) =>
      !isPipelineUpdate(candidate.updateOne.update) &&
      (id === undefined || candidate.updateOne.filter._id === id)
  );
  if (!op || isPipelineUpdate(op.updateOne.update)) throw new Error("missing fields $set op");
  return op.updateOne.update.$set;
}

/** Evaluate the actions pipeline against a live balance (Mongo stand-in). */
function applyActionsPipeline(op: BulkOp, liveActions: number): number {
  if (!isPipelineUpdate(op.updateOne.update)) throw new Error("expected pipeline");
  const actionsExpr = op.updateOne.update[0]!.$set.actions as {
    $min: [
      number,
      {
        $max: [
          number,
          {
            $add: [
              {
                $subtract: [
                  { $ifNull: [string, number] },
                  {
                    $cond: [{ $gt: [{ $ifNull: [string, number] }, number] }, number, number];
                  },
                ];
              },
              number,
            ];
          },
        ];
      },
    ];
  };
  const energyCap = actionsExpr.$min[0];
  const addExpr = actionsExpr.$min[1].$max[1];
  const actionRefresh = addExpr.$add[1];
  const threshold = addExpr.$add[0].$subtract[1].$cond[0].$gt[1];
  const penaltyAmount = addExpr.$add[0].$subtract[1].$cond[1];
  const penalty = liveActions > threshold ? penaltyAmount : 0;
  return Math.min(energyCap, Math.max(0, liveActions - penalty + actionRefresh));
}

describe("processActionRefresh", () => {
  const mockBulkWrite = vi.fn();
  let chairRows: { chairCharacterId: unknown }[] = [];
  let cabinetRows: { characterId: unknown; countryId: string; acting?: boolean }[] = [];
  let congressLeaderRows: { characterId: unknown; role: string }[] = [];
  let electedRows: {
    characterId: unknown;
    officeType: string;
    countryId: string;
    party?: string;
  }[] = [];
  let nppRows: {
    _id: unknown;
    countryId?: string;
    party?: string;
    politicalInfluence: number;
    favorability: number;
  }[] = [];
  let governmentFormationRows: Record<string, unknown>[] = [];
  let governmentApprovalRows: Record<string, unknown>[] = [];
  let seatedJusticeRows: { justiceCharacterId: unknown }[] = [];
  let persistFixture = false;
  let characterRows: Character[] = [];
  const mockNppBulkWrite = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    roleFixtures.oppositionLeaderIds = new Set();
    roleFixtures.shadowCabinetIds = new Set();
    roleFixtures.presidingOfficers = [];
    roleFixtures.statePartyChairIds = new Set();
    roleFixtures.orgHeadIds = new Set();
    roleFixtures.ceoCandidates = new Map();
    chairRows = [];
    cabinetRows = [];
    congressLeaderRows = [];
    electedRows = [];
    nppRows = [];
    governmentFormationRows = [];
    governmentApprovalRows = [];
    seatedJusticeRows = [];
    persistFixture = false;
    characterRows = [];
    mockBulkWrite.mockImplementation(async (ops: unknown[]) => {
      if (persistFixture) {
        for (const op of ops as {
          updateOne: { filter: { _id: unknown }; update: { $set: Partial<Character> } };
        }[]) {
          const row = characterRows.find((candidate) => candidate._id === op.updateOne.filter._id);
          if (row) Object.assign(row, op.updateOne.update.$set);
        }
      }
      return { modifiedCount: ops.length };
    });
    mockNppBulkWrite.mockImplementation(async (ops: unknown[]) => {
      if (persistFixture) {
        for (const op of ops as {
          updateOne: { filter: { _id: unknown }; update: { $set: Record<string, unknown> } };
        }[]) {
          const row = nppRows.find((candidate) => candidate._id === op.updateOne.filter._id);
          if (row) Object.assign(row, op.updateOne.update.$set);
        }
      }
      return { modifiedCount: ops.length };
    });
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === "npps") {
          return {
            // Yield whatever NPP rows the test queued (empty by default).
            find: vi.fn().mockImplementation(() => ({
              toArray: vi.fn().mockResolvedValue(nppRows),
              [Symbol.asyncIterator]: async function* () {
                for (const npp of nppRows) yield npp;
              },
            })),
            bulkWrite: mockNppBulkWrite,
          };
        }
        if (name === "governmentFormations" || name === "parliamentaryGovernments") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(governmentFormationRows),
            }),
            bulkWrite: mockBulkWrite,
          };
        }
        if (name === "governmentApprovals") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(governmentApprovalRows),
            }),
            bulkWrite: mockBulkWrite,
          };
        }
        if (name === "characters") {
          return {
            find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(characterRows) }),
            bulkWrite: mockBulkWrite,
          };
        }
        if (name === "centralBanks") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(chairRows),
            }),
          };
        }
        if (name === "congressLeaders") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(congressLeaderRows),
            }),
          };
        }
        if (name === "politicalParties") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
            }),
          };
        }
        if (name === "cabinetMembers") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(cabinetRows),
            }),
          };
        }
        if (name === "electedOfficials") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(electedRows),
            }),
          };
        }
        if (name === "supremeCourtSeats") {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(seatedJusticeRows),
            }),
          };
        }
        if (name === "governmentAccountability")
          return { find: vi.fn().mockReturnValue({ toArray: async () => [] }), bulkWrite: vi.fn() };
        return {
          find: vi.fn().mockReturnValue({ toArray: async () => [] }),
          bulkWrite: mockBulkWrite,
          findOne: vi.fn().mockResolvedValue(null),
          insertOne: vi.fn().mockResolvedValue(undefined),
        };
      }),
    } as never);
  });

  it("updates character with base actions only", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "char1" as never,
      userId: "user1" as never,
      name: "Test",
      countryId: "US",
      homeState: "CA",
      policies: { economic: 0, social: 0 },
      actions: 5,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 10,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    expect(ops).toHaveLength(2);
    const grantOp = actionsGrantOp(ops, "char1");
    expect(grantOp.updateOne.filter).toEqual({ _id: "char1" });
    expect(applyActionsPipeline(grantOp, 5)).toBe(9); // 5 + 4 base
    const update = fieldsSet(ops, "char1");
    expect(update.actions).toBeUndefined();
    // politicalInfluence starts at 10, decays by 10 * 0.0075 = 0.075
    expect(update.politicalInfluence).toBeCloseTo(9.925, 5);
    // fields update keeps optimistic concurrency without actions
    const fieldsOp = ops.find((op) => !isPipelineUpdate(op.updateOne.update))!;
    expect(fieldsOp.updateOne.filter).toMatchObject({
      _id: "char1",
      politicalInfluence: 10,
      nationalInfluence: 0,
    });
    expect(fieldsOp.updateOne.filter).not.toHaveProperty("actions");
    // State influence 10 earns 10/50 - 0.5 = -0.3 NI; national influence is
    // floored at 0.
    expect(update.nationalInfluence).toBe(0);
    expect(update.infamy).toBeDefined();
    expect(update.favorability).toBeDefined();
  });

  it("grants personal AP from live actions even if the snapshot balance was spent mid-turn", async () => {
    // Refs #4457: optimistic filter on snapshotted actions let a mid-turn spend
    // cancel the whole refresh; party bonus still landed via a live $actions pipeline.
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "midTurnSpend" as never,
      userId: "userMid" as never,
      name: "Spender",
      countryId: "US",
      homeState: "CA",
      policies: { economic: 0, social: 0 },
      actions: 20, // snapshot balance before the mid-turn spend
      funds: 100000,
      favorability: 50,
      politicalInfluence: 10,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: { type: "house", state: "CA" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: { house: 1 },
      chairActionBonus: 3,
    } as unknown as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const grantOp = actionsGrantOp(ops, "midTurnSpend");
    // Must not require the snapshotted actions value - a mid-turn spend would miss.
    expect(grantOp.updateOne.filter).toEqual({ _id: "midTurnSpend" });
    expect(isPipelineUpdate(grantOp.updateOne.update)).toBe(true);
    // Grant is base 4 + house 1 = 5; applied to live post-spend balance 8 → 13.
    expect(applyActionsPipeline(grantOp, 8)).toBe(13);
    // Influence/stats keep optimistic concurrency and must not rewrite actions.
    const fields = fieldsSet(ops, "midTurnSpend");
    expect(fields.actions).toBeUndefined();
    expect(fields.politicalInfluence).toBeCloseTo(9.925, 5);
  });

  it("applies hoarding penalty when actions > 100", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "char2" as never,
      userId: "user2" as never,
      name: "Hoarder",
      countryId: "US",
      homeState: "TX",
      policies: { economic: 0, social: 0 },
      actions: 105,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    // 105 - 4 (penalty) + 4 (base) = 105
    expect(applyActionsPipeline(actionsGrantOp(ops), 105)).toBe(105);
  });

  it("applies the advertised infamy favorability drain above 20 infamy", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "charInfamy" as never,
      userId: "userInfamy" as never,
      name: "Notorious",
      countryId: "US",
      homeState: "TX",
      policies: { economic: 0, social: 0 },
      actions: 5,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 60,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const update = fieldsSet(ops);
    // (60 - 20) x 0.05 = 2.0 favorability drain; fav 50 is below the
    // above-threshold penalty, so the drain is the only change.
    expect(update.favorability).toBeCloseTo(48, 5);
    // Infamy still decays 5% on top of the drain it caused.
    expect(update.infamy).toBeCloseTo(57, 5);
  });

  it("does not drain favorability at or below 20 infamy and clamps at the 0 floor", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const base = {
      userId: "u" as never,
      name: "X",
      countryId: "US",
      homeState: "TX",
      policies: { economic: 0, social: 0 },
      actions: 5,
      funds: 100000,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mild: Character = {
      ...base,
      _id: "charMild" as never,
      favorability: 50,
      infamy: 20,
    } as Character;
    const doomed: Character = {
      ...base,
      _id: "charDoomed" as never,
      favorability: 1,
      infamy: 100,
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([mild, doomed], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0];
    const byId = Object.fromEntries(
      (
        ops as {
          updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } };
        }[]
      ).map((op) => [op.updateOne.filter._id, op.updateOne.update.$set])
    );
    // At exactly 20 infamy: no drain.
    expect(byId.charMild.favorability).toBeCloseTo(50, 5);
    // 100 infamy drains 4/turn but favorability clamps at the 0 floor.
    expect(byId.charDoomed.favorability).toBe(0);
  });

  it("stacks chair bonus on top of elected-office bonus when character is central bank chair", async () => {
    // Regression: John Blackthorne (sangiin + BoJ chair) was only getting sangiin
    // bonus because chair status lived on currentOffice and got clobbered each
    // election. Chair bonus now comes from centralBanks.chairCharacterId and
    // stacks with whatever elected seat is in currentOffice.
    const { processActionRefresh } = await import("./actionRefresh");
    const charId = "chair-char" as never;
    chairRows = [{ chairCharacterId: { toString: () => "chair-char" } }];

    const char: Character = {
      _id: charId,
      userId: "user1" as never,
      name: "Chair + Legislator",
      countryId: "JP",
      homeState: "KAN",
      policies: { economic: 0, social: 0 },
      actions: 10,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "cdp",
      currentOffice: { type: "sangiin", state: "KAN", seatsHeld: 11, chamberClass: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: { sangiin: 1 } as Record<string, number>,
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    // 10 + base 4 + sangiin 1 + chair 3 = 18
    expect(applyActionsPipeline(actionsGrantOp(ops), 10)).toBe(18);
  });

  it("grants only the chair bonus when chair holds no elected office", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const charId = "chair-only" as never;
    chairRows = [{ chairCharacterId: { toString: () => "chair-only" } }];

    const char: Character = {
      _id: charId,
      userId: "user1" as never,
      name: "Chair only",
      countryId: "US",
      homeState: "NY",
      policies: { economic: 0, social: 0 },
      actions: 0,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "democrat",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    // 0 + base 4 + chair 3 = 7
    expect(applyActionsPipeline(actionsGrantOp(ops), 0)).toBe(7);
  });

  it("grants the Justice NI bonus (#3598) on top of an elected-office NI bonus, stacked like the chair bonus", async () => {
    // A seated Justice is stored on supremeCourtSeats.justiceCharacterId, not
    // character.currentOffice - mirrors the central bank chair bonus stacking
    // pattern above, not the chairRows one (different collection/field).
    const { processActionRefresh } = await import("./actionRefresh");
    const charId = "justice-char" as never;
    seatedJusticeRows = [{ justiceCharacterId: { toString: () => "justice-char" } }];

    const char: Character = {
      _id: charId,
      userId: "user1" as never,
      name: "Justice + Senator",
      countryId: "US",
      homeState: "NY",
      policies: { economic: 0, social: 0 },
      actions: 0,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "democrat",
      currentOffice: { type: "senate", state: "NY", senateClass: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const update = fieldsSet(ops);
    // Senate tier 1.0, Justice tier 1.5: the higher wins (Math.max stacking,
    // same as party-chair/leader tiers). State influence 0 costs 0.5.
    expect(update.nationalInfluence).toBeCloseTo(1.0, 5);
    // The Justice AP bonus stacks on the Senate seat: 4 base + 2 seat + 2.
    expect(applyActionsPipeline(actionsGrantOp(ops), 0)).toBe(8);
  });

  it("stacks the cabinet bonus on the legislative seat for a cabinet minister", async () => {
    // Bug #0758: a DE minister's currentOffice is overwritten to
    // parliamentaryCabinet on appointment, but they still hold their bundestag
    // seat in electedOfficials. The office bonus must be seat + cabinet, not 0.
    const { processActionRefresh } = await import("./actionRefresh");
    const charId = "de-minister" as never;
    cabinetRows = [{ characterId: { toString: () => "de-minister" }, countryId: "DE" }];
    electedRows = [
      { characterId: { toString: () => "de-minister" }, officeType: "bundestag", countryId: "DE" },
    ];

    const char: Character = {
      _id: charId,
      userId: "user1" as never,
      name: "Roman Herzog",
      countryId: "DE",
      homeState: "NI",
      policies: { economic: 0, social: 0 },
      actions: 0,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "2",
      currentOffice: { type: "parliamentaryCabinet", positionId: "defense_minister" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: { bundestag: 1, parliamentaryCabinet: 1 } as Record<string, number>,
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const update = fieldsSet(ops);
    // 0 + base 4 + bundestag seat 1 + cabinet 1 = 6
    expect(applyActionsPipeline(actionsGrantOp(ops), 0)).toBe(6);
  });

  it("grants an acting cabinet member the acting NI tier without currentOffice", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    cabinetRows = [
      {
        characterId: { toString: () => "acting-secretary" },
        countryId: "US",
        acting: true,
      },
    ];
    const character: Character = {
      _id: "acting-secretary" as never,
      userId: "acting-user" as never,
      name: "Acting Secretary",
      countryId: "US",
      homeState: "NY",
      policies: { economic: 0, social: 0 },
      actions: 0,
      funds: 0,
      favorability: 50,
      politicalInfluence: 25,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    await processActionRefresh([character], null, new Date());

    const update = fieldsSet(mockBulkWrite.mock.calls[0][0] as BulkOp[]);
    // Acting tier 0.75; state influence 25 adds nothing.
    expect(update.nationalInfluence).toBeCloseTo(0.75, 5);
  });

  it("uses the Speaker NI tier when the Speaker also holds an acting cabinet seat", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    congressLeaderRows = [
      { characterId: { toString: () => "speaker" }, role: "speaker_of_the_house" },
    ];
    cabinetRows = [{ characterId: { toString: () => "speaker" }, countryId: "US", acting: true }];
    const character: Character = {
      _id: "speaker" as never,
      userId: "speaker-user" as never,
      name: "Speaker",
      countryId: "US",
      homeState: "NY",
      policies: { economic: 0, social: 0 },
      actions: 0,
      funds: 0,
      favorability: 50,
      politicalInfluence: 25,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: { type: "house", state: "NY", district: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    await processActionRefresh([character], null, new Date());

    const ops = mockBulkWrite.mock.calls[0][0] as BulkOp[];
    const update = fieldsSet(ops);
    expect(update.nationalInfluence).toBeCloseTo(2, 5);
    // Presiding officer AP: 4 base + 1 House seat + 3 Speaker.
    expect(applyActionsPipeline(actionsGrantOp(ops), 0)).toBe(8);
  });

  it("caps actions at 200", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "char3" as never,
      userId: "user3" as never,
      name: "Capped",
      countryId: "US",
      homeState: "NY",
      policies: { economic: 0, social: 0 },
      actions: 201, // 201 - 4 (hoard) + 3 (base) = 200
      funds: 100000,
      favorability: 50,
      politicalInfluence: 0,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const granted = applyActionsPipeline(actionsGrantOp(ops), 201);
    expect(granted).toBeLessThanOrEqual(200);
    expect(granted).toBe(200); // capped
  });

  it("clamps over-cap player influence and favorability back to 100", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const char: Character = {
      _id: "char4" as never,
      userId: "user4" as never,
      name: "Overcapped",
      countryId: "US",
      homeState: "FL",
      policies: { economic: 0, social: 0 },
      actions: 10,
      funds: 100000,
      favorability: 125,
      politicalInfluence: 140,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([char], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    const update = fieldsSet(ops);
    expect(update.politicalInfluence).toBe(100);
    expect(update.favorability).toBe(100);
  });

  it("barriers NPP influence decay at 10 while players still decay below it", async () => {
    const { processActionRefresh } = await import("./actionRefresh");

    // A player sitting exactly on the NPP floor must keep decaying (floor 0).
    const player: Character = {
      _id: "playerLow" as never,
      userId: "userLow" as never,
      name: "LowPlayer",
      countryId: "US",
      homeState: "CA",
      policies: { economic: 0, social: 0 },
      actions: 5,
      funds: 100000,
      favorability: 50,
      politicalInfluence: 10,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Character;

    // NPPs: one on the floor (stays), one above (decays), one shell below the
    // floor (held in place, NOT inflated up to 10).
    nppRows = [
      { _id: "nppOnFloor", politicalInfluence: 10, favorability: 50 },
      { _id: "nppAbove", politicalInfluence: 30, favorability: 72 },
      { _id: "nppShell", politicalInfluence: 1, favorability: 50 },
    ];

    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    await processActionRefresh([player], config, new Date());

    // Player still decays below 10 (floor 0).
    const playerUpdate = fieldsSet(mockBulkWrite.mock.calls[0][0] as BulkOp[]);
    expect(playerUpdate.politicalInfluence).toBeCloseTo(9.925, 5);

    // NPP ops go through the dedicated npp bulkWrite.
    const nppOps = mockNppBulkWrite.mock.calls[0][0] as {
      updateOne: { filter: { _id: string }; update: { $set: Record<string, number> } };
    }[];
    const byId = Object.fromEntries(
      nppOps.map((op) => [op.updateOne.filter._id, op.updateOne.update.$set])
    );
    expect(byId.nppOnFloor.politicalInfluence).toBe(10);
    expect(byId.nppAbove.politicalInfluence).toBeCloseTo(30 - 30 * 0.0075, 5);
    expect(byId.nppShell.politicalInfluence).toBe(1);
  });

  it("applies the government approval drain to an NPP head of government", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const pmNppId = "nppExecutive" as never;
    nppRows = [
      {
        _id: pmNppId,
        countryId: "DD",
        party: "sed",
        politicalInfluence: 10,
        favorability: 50,
      },
    ];
    governmentFormationRows = [
      { _id: "DD", countryId: "DD", status: "formed", pmCharacterId: null, pmNppId },
    ];
    governmentApprovalRows = [{ _id: "DD", approvalRating: 20 }];

    await processActionRefresh([], null, new Date());

    const update = mockNppBulkWrite.mock.calls.at(-1)![0][0].updateOne.update.$set;
    expect(update.favorability).toBeCloseTo(49.8875, 5);
  });

  it("applies accountability in an in-memory persisted fixture while excluding a ceremonial president", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    const config = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: {},
      chairActionBonus: 3,
    } as GameConfig;

    const makeCharacter = (id: string, countryId: string, party: string): Character =>
      ({
        _id: id as never,
        userId: `user-${id}` as never,
        name: id,
        countryId,
        homeState: "NATIONAL",
        policies: { economic: 0, social: 0 },
        actions: 5,
        funds: 0,
        favorability: 50,
        politicalInfluence: 10,
        nationalInfluence: 0,
        donorBaseLevel: 0,
        infamy: 0,
        party,
        currentOffice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as Character;

    const runFixture = async (approvalRating: number) => {
      const usMember = makeCharacter("us-member", "US", "democrat");
      const usPartyMember = makeCharacter("us-party-member", "US", "democrat");
      const ruPm = makeCharacter("ru-pm", "RU", "communist");
      const ceremonialPresident = makeCharacter("ru-president", "RU", "ceremonial");
      usMember.favorability = 49;
      usMember.infamy = 40;
      const nppExecutive = {
        _id: "dd-npp-executive" as never,
        countryId: "DD",
        party: "sed",
        politicalInfluence: 10,
        favorability: 50,
      };
      characterRows = [usMember, usPartyMember, ruPm, ceremonialPresident];
      nppRows = [nppExecutive];
      electedRows = [
        { characterId: usMember._id, officeType: "president", countryId: "US" },
        {
          characterId: ceremonialPresident._id,
          officeType: "president",
          countryId: "RU",
          party: "ceremonial",
        },
      ];
      governmentFormationRows = [
        {
          _id: "RU",
          countryId: "RU",
          status: "formed",
          pmCharacterId: ruPm._id,
          pmNppId: null,
        },
        {
          _id: "DD",
          countryId: "DD",
          status: "formed",
          pmCharacterId: null,
          pmNppId: nppExecutive._id,
        },
      ];
      governmentApprovalRows = [
        { _id: "US", approvalRating },
        { _id: "RU", approvalRating },
        { _id: "DD", approvalRating },
      ];
      persistFixture = true;

      await processActionRefresh(characterRows, config, new Date());
      return { usMember, usPartyMember, ruPm, ceremonialPresident, nppExecutive };
    };

    const accountable = await runFixture(20);
    const control = await runFixture(50);

    // The US executive also takes the ordinary 1-point infamy drain (40 - 20) *
    // 0.05, so the persisted fixture still exposes the exact 0.15 delta.
    expect(accountable.usMember.favorability).toBeCloseTo(47.8875, 5);
    expect(accountable.usPartyMember.favorability).toBeCloseTo(49.8875, 5);
    expect(accountable.ruPm.favorability).toBeCloseTo(49.8875, 5);
    expect(accountable.nppExecutive.favorability).toBeCloseTo(49.8875, 5);
    expect(accountable.ceremonialPresident.favorability).toBeCloseTo(50, 5);
    expect(control.usMember.favorability).toBeCloseTo(48, 5);
    expect(control.usPartyMember.favorability).toBeCloseTo(50, 5);
    expect(control.ruPm.favorability).toBeCloseTo(50, 5);
    expect(control.nppExecutive.favorability).toBeCloseTo(50, 5);
    expect(control.ceremonialPresident.favorability).toBeCloseTo(50, 5);
    expect(control.usMember.favorability - accountable.usMember.favorability).toBeCloseTo(
      0.1125,
      5
    );
    expect(control.nppExecutive.favorability - accountable.nppExecutive.favorability).toBeCloseTo(
      0.1125,
      5
    );
  });

  it("grants a DD Volkskammer deputy the same seat generation a US member gets (ticket #974)", async () => {
    const { processActionRefresh } = await import("./actionRefresh");
    // The live gameConfig map has no key for any non-US-vocabulary office, so
    // the registry fallback is what has to supply the bonus here.
    const config: GameConfig = {
      _id: "default",
      baseActionsPerTurn: 4,
      officeActionBonus: { house: 1, senate: 2 },
      chairActionBonus: 3,
    } as unknown as GameConfig;

    const deputy: Character = {
      _id: "ddDeputy" as never,
      userId: "userDD" as never,
      name: "Deputy",
      countryId: "DD",
      homeState: "TH",
      policies: { economic: 0, social: 0 },
      actions: 5,
      funds: 0,
      favorability: 50,
      politicalInfluence: 25,
      nationalInfluence: 0,
      donorBaseLevel: 0,
      infamy: 0,
      party: "independent",
      currentOffice: { type: "volkskammerDeputy", state: "TH" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Character;

    const rep: Character = {
      ...deputy,
      _id: "usRep" as never,
      countryId: "US",
      homeState: "CA",
      currentOffice: { type: "house", state: "CA" },
    } as unknown as Character;

    await processActionRefresh([deputy, rep], config, new Date());

    const [ops] = mockBulkWrite.mock.calls[0] as [BulkOp[]];
    // 5 + 4 base + 1 seat bonus - identical to the US representative.
    expect(applyActionsPipeline(actionsGrantOp(ops, "ddDeputy"), 5)).toBe(10);
    expect(applyActionsPipeline(actionsGrantOp(ops, "usRep"), 5)).toBe(10);
    // Rank-and-file legislator NI tier, also identical.
    expect(fieldsSet(ops, "ddDeputy").nationalInfluence).toBeCloseTo(1.0, 5);
    expect(fieldsSet(ops, "usRep").nationalInfluence).toBeCloseTo(1.0, 5);
  });

  describe("actions and national influence rework", () => {
    const baseCharacter = (overrides: Partial<Character>): Character =>
      ({
        _id: "c1" as never,
        userId: "u1" as never,
        name: "Test",
        countryId: "US",
        homeState: "NY",
        policies: { economic: 0, social: 0 },
        actions: 0,
        funds: 0,
        favorability: 50,
        politicalInfluence: 25,
        nationalInfluence: 0,
        donorBaseLevel: 0,
        infamy: 0,
        party: "independent",
        currentOffice: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      }) as Character;
    const refreshOne = async (
      character: Character,
      config: GameConfig | null = null
    ): Promise<Record<string, unknown> & { actions: number }> => {
      const { processActionRefresh } = await import("./actionRefresh");
      await processActionRefresh([character], config, new Date());
      const ops = mockBulkWrite.mock.calls[0][0] as BulkOp[];
      const fields = fieldsSet(ops);
      return {
        ...fields,
        actions: applyActionsPipeline(actionsGrantOp(ops), character.actions ?? 0),
      };
    };

    it("decays national influence 1% before adding the turn's gain", async () => {
      const update = await refreshOne(
        baseCharacter({ nationalInfluence: 200, currentOffice: { type: "house" } as never })
      );
      // 200 - 2 decay + 1.0 legislator tier + 0 (state influence 25).
      expect(update.nationalInfluence).toBeCloseTo(199, 5);
    });

    it("scales the state influence term steeply at both ends", async () => {
      expect(
        (await refreshOne(baseCharacter({ politicalInfluence: 100, nationalInfluence: 10 })))
          .nationalInfluence
      ).toBeCloseTo(10 - 0.1 + 2, 5);
    });

    it("grants chamber leadership AP: Leader of the Opposition +2", async () => {
      roleFixtures.oppositionLeaderIds = new Set(["c1"]);
      const update = await refreshOne(baseCharacter({ actions: 0 }));
      expect(update.actions).toBe(6);
      expect(update.roleActionBonus).toBe(2);
    });

    it("grants a shadow cabinet member +1 AP", async () => {
      roleFixtures.shadowCabinetIds = new Set(["c1"]);
      expect((await refreshOne(baseCharacter({}))).actions).toBe(5);
    });

    it("takes only the highest leadership role", async () => {
      congressLeaderRows = [
        { characterId: { toString: () => "c1" }, role: "majority_whip_house" },
        { characterId: { toString: () => "c1" }, role: "majority_leader_house" },
      ];
      roleFixtures.shadowCabinetIds = new Set(["c1"]);
      expect((await refreshOne(baseCharacter({}))).actions).toBe(6);
    });

    it("maps Nigerian presiding officers onto the presiding tier", async () => {
      roleFixtures.presidingOfficers = [
        { characterId: { toString: () => "c1" }, role: "speaker_ng_reps" },
      ];
      const update = await refreshOne(baseCharacter({ countryId: "NG" as never }));
      expect(update.actions).toBe(7);
      expect(update.nationalInfluence).toBeCloseTo(2, 5);
    });

    it("adds international leadership NI on top of the domestic tier", async () => {
      roleFixtures.orgHeadIds = new Set(["c1"]);
      const update = await refreshOne(
        baseCharacter({ currentOffice: { type: "senate" } as never })
      );
      expect(update.nationalInfluence).toBeCloseTo(2, 5);
    });

    it("gives a state party chair the 0.5 tier", async () => {
      roleFixtures.statePartyChairIds = new Set(["c1"]);
      expect((await refreshOne(baseCharacter({}))).nationalInfluence).toBeCloseTo(0.5, 5);
    });

    it("waits out the CEO tenure before granting CEO NI, then grants the tier", async () => {
      roleFixtures.ceoCandidates = new Map([["c1", { corporationId: "corp1", tier: "major" }]]);
      const first = await refreshOne(baseCharacter({}));
      expect(first.nationalInfluence).toBe(0);
      expect(first.ceoNiTier).toBeNull();
      expect(first.ceoNiTenure).toEqual({ corporationId: "corp1", sinceTurn: 0 });

      mockBulkWrite.mockClear();
      const later = await refreshOne(
        baseCharacter({ ceoNiTenure: { corporationId: "corp1", sinceTurn: -12 } })
      );
      expect(later.ceoNiTier).toBe("major");
      expect(later.nationalInfluence).toBeCloseTo(0.3, 5);
    });

    it("restarts CEO tenure when the qualifying corporation changes", async () => {
      roleFixtures.ceoCandidates = new Map([["c1", { corporationId: "corp2", tier: "standard" }]]);
      const update = await refreshOne(
        baseCharacter({ ceoNiTenure: { corporationId: "corp1", sinceTurn: -50 } })
      );
      expect(update.ceoNiTier).toBeNull();
      expect(update.ceoNiTenure).toEqual({ corporationId: "corp2", sinceTurn: 0 });
    });

    it("decays the executive party's political influence faster, scaled by approval", async () => {
      const pmNppId = "nppExecutive" as never;
      nppRows = [
        { _id: pmNppId, countryId: "DD", party: "sed", politicalInfluence: 10, favorability: 50 },
      ];
      governmentFormationRows = [
        { _id: "DD", countryId: "DD", status: "formed", pmCharacterId: null, pmNppId },
      ];
      governmentApprovalRows = [{ _id: "DD", approvalRating: 20 }];
      const { processActionRefresh } = await import("./actionRefresh");
      await processActionRefresh(
        [
          baseCharacter({
            _id: "member" as never,
            countryId: "DD" as never,
            party: "sed",
            politicalInfluence: 40,
          }),
          baseCharacter({
            _id: "rival" as never,
            countryId: "DD" as never,
            party: "ldpd",
            politicalInfluence: 40,
          }),
        ],
        null,
        new Date()
      );
      const ops = mockBulkWrite.mock.calls.find((call) =>
        (call[0] as BulkOp[]).some((op) => op.updateOne.filter._id === "member")
      )![0] as BulkOp[];
      const byId = Object.fromEntries(
        ops
          .filter((op) => !isPipelineUpdate(op.updateOne.update))
          .map((op) => [
            op.updateOne.filter._id,
            (op.updateOne.update as { $set: Record<string, number> }).$set,
          ])
      );
      // 20% approval: 1.8x of the 0.75% decay.
      expect(byId.member.politicalInfluence).toBeCloseTo(40 - 40 * 0.0075 * 1.8, 5);
      expect(byId.member.politicalInfluenceDecayMultiplier).toBeCloseTo(1.8, 5);
      expect(byId.rival.politicalInfluence).toBeCloseTo(40 - 40 * 0.0075, 5);
    });
  });
});
