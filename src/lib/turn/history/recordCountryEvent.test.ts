import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordCountryEvent } from "./recordCountryEvent";

vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn(async () => ({
    iteration: { type: "Beta", number: 2 },
    startingYear: 2019,
  })),
}));

type Inserted = Record<string, unknown>;

function makeDb(
  inserted: Inserted[],
  findParty = vi.fn(async () => null as null | { name: string; abbreviation: string })
) {
  return {
    collection: () => ({
      findOne: findParty,
      insertOne: async (doc: Inserted) => {
        inserted.push(doc);
      },
    }),
  } as never;
}

describe("recordCountryEvent iteration stamp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps current iteration and startingYear", async () => {
    const inserted: Inserted[] = [];
    await recordCountryEvent(makeDb(inserted), {
      countryId: "US",
      turn: 5,
      eventType: "leader_change",
      title: "x",
      officeType: "president",
    });
    expect(inserted[0].iteration).toEqual({ type: "Beta", number: 2 });
    expect(inserted[0].iterationStartingYear).toBe(2019);
  });

  it.each(["US", "UK", "JP"] as const)(
    "freezes the handover identity in %s with one projected party read",
    async (countryId) => {
      const inserted: Inserted[] = [];
      const findParty = vi.fn(async () => ({ name: "Original Party", abbreviation: "OLD" }));
      const input = {
        countryId,
        turn: 5,
        eventType: "leader_change" as const,
        title: "Sworn in",
        characterName: "Original Name",
        party: "7",
        details: { isNPP: false },
      };
      await recordCountryEvent(makeDb(inserted, findParty), input);
      input.characterName = "Renamed Person";
      expect(inserted[0].details).toEqual({
        isNPP: false,
        officeIdentitySnapshot: {
          name: "Original Name",
          party: "7",
          partyLabel: "Original Party (OLD)",
        },
      });
      expect(findParty).toHaveBeenCalledExactlyOnceWith(
        { countryId, sequentialId: 7 },
        { projection: { name: 1, abbreviation: 1 } }
      );
    }
  );

  it("adds no party lookup to other event types", async () => {
    const findParty = vi.fn();
    await recordCountryEvent(makeDb([], findParty), {
      countryId: "US",
      turn: 1,
      eventType: "bill_enacted",
      title: "Law",
      party: "7",
    });
    expect(findParty).not.toHaveBeenCalled();
  });
});
