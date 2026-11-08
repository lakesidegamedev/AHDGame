import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const awardAchievements = vi.fn().mockResolvedValue(0);

vi.mock("./index", () => ({
  awardAchievement: vi.fn(),
  awardAchievements,
}));

const getDb = vi.fn();
vi.mock("@/lib/mongodb", () => ({ getDb: (...args: unknown[]) => getDb(...args) }));

describe("checkPassiveProfileAchievements", () => {
  beforeEach(() => {
    awardAchievements.mockClear();
  });

  it("awards matching profile and combined-role achievements in one batch", async () => {
    const { checkPassiveProfileAchievements } = await import("./triggers");
    const userId = new ObjectId();
    const characterId = new ObjectId();

    await checkPassiveProfileAchievements(userId, characterId, {
      iteration: { type: "Iteration", number: 1 },
      hasCeoCorp: true,
      hasCabinetSeat: true,
      hasCentralBankChair: false,
      isPartyChair: true,
      hasElectedOffice: true,
      bondIncomePerTurn: 10,
      dividendIncomePerTurn: 0,
      characterCreatedAt: new Date(),
      statsAllocated: false,
      onboardingComplete: true,
      hallOfFameTop10: false,
    });

    expect(awardAchievements).toHaveBeenCalledWith(
      userId,
      [
        "iteration4_founder",
        "corner_office",
        "cabinet_seat",
        "bondholder",
        "onboarded",
        "iron_triangle",
      ],
      characterId
    );
  });
});

describe("checkElectionWinAchievements", () => {
  beforeEach(() => {
    awardAchievements.mockClear();
  });

  function dbWithElectedEvents(wins: number) {
    const aggregate = vi.fn().mockReturnValue({ toArray: async () => [{ wins }] });
    getDb.mockResolvedValue({ collection: () => ({ aggregate }) });
    return aggregate;
  }

  it("awards three_terms from elected career events when the character holds one seat", async () => {
    const { checkElectionWinAchievements } = await import("./triggers");
    const userId = new ObjectId();
    const characterId = new ObjectId();
    const aggregate = dbWithElectedEvents(3);

    await checkElectionWinAchievements(userId, characterId, "governor");

    expect(aggregate.mock.calls[0]![0][0]).toEqual({ $match: { _id: characterId } });
    expect(awardAchievements).toHaveBeenCalledWith(
      userId,
      ["governor", "three_terms"],
      characterId
    );
  });

  it("does not award three_terms below three wins", async () => {
    const { checkElectionWinAchievements } = await import("./triggers");
    const userId = new ObjectId();
    const characterId = new ObjectId();
    dbWithElectedEvents(2);

    await checkElectionWinAchievements(userId, characterId, "governor");

    expect(awardAchievements).toHaveBeenCalledWith(userId, ["governor"], characterId);
  });
});

describe("checkOfficeHeldAchievements", () => {
  beforeEach(() => {
    awardAchievements.mockClear();
  });

  it.each([
    ["president", "president"],
    ["vicePresident", "vice_president"],
  ])("awards %s", async (officeType, slug) => {
    const { checkOfficeHeldAchievements } = await import("./triggers");
    const userId = new ObjectId();
    const characterId = new ObjectId();

    await checkOfficeHeldAchievements(userId, characterId, officeType);

    expect(awardAchievements).toHaveBeenCalledWith(userId, [slug], characterId);
  });
});
