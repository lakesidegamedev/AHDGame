import { describe, expect, it } from "vitest";
import {
  deriveSingleplayerGuide,
  singleplayerGuideComplete,
  type SingleplayerGuideCharacter,
  type SingleplayerGuideInputs,
} from "./singleplayerGuide";

const character: SingleplayerGuideCharacter = {
  countryId: "US",
  party: "independent",
  currentOffice: null,
  careerHistory: [],
  onboarding: undefined,
  funds: 120_000,
  actions: 6,
  createdTurn: 4,
};

function input(overrides: Partial<SingleplayerGuideInputs> = {}): SingleplayerGuideInputs {
  return {
    config: { mode: "normal", guide: {} },
    character,
    currentTurn: 4,
    hasCampaignActed: false,
    partiesAvailable: true,
    ...overrides,
  };
}

const doneIds = (guide: ReturnType<typeof deriveSingleplayerGuide>) =>
  guide.steps.filter((s) => s.done).map((s) => s.id);

describe("deriveSingleplayerGuide", () => {
  it("is not offered to worlds saved before the guide existed", () => {
    const guide = deriveSingleplayerGuide(input({ config: { mode: "normal" } }));
    expect(guide).toMatchObject({ offered: false, active: false, steps: [] });
  });

  it("treats a stored null guide as not offered", () => {
    const config = { mode: "normal", guide: null } as unknown as SingleplayerGuideInputs["config"];
    expect(deriveSingleplayerGuide(input({ config })).offered).toBe(false);
  });

  it("is not offered outside normal mode", () => {
    for (const mode of ["head-of-state", "worldsim"] as const) {
      const guide = deriveSingleplayerGuide(input({ config: { mode, guide: {} } }));
      expect(guide.offered).toBe(false);
      expect(guide.active).toBe(false);
    }
    expect(deriveSingleplayerGuide(input({ config: null })).offered).toBe(false);
  });

  it("stays out of the way for good once dismissed, but still counts as offered", () => {
    const guide = deriveSingleplayerGuide(
      input({ config: { mode: "normal", guide: { dismissedAt: new Date() } } })
    );
    expect(guide).toMatchObject({ offered: true, active: false, steps: [] });
  });

  it("starts at character creation when there is no character", () => {
    const guide = deriveSingleplayerGuide(input({ character: null }));
    expect(guide.active).toBe(true);
    expect(guide.steps.map((s) => s.id)).toEqual([
      "character",
      "campaign",
      "party",
      "end-turn",
      "inbox",
    ]);
    expect(doneIds(guide)).toEqual([]);
    expect(guide.steps[0].href).toBe("/create-character");
    expect(guide.funds).toBeNull();
  });

  it("marks the character step done from the character, and quotes funds and actions", () => {
    const guide = deriveSingleplayerGuide(input());
    expect(doneIds(guide)).toEqual(["character"]);
    expect(guide.funds).toBe(120_000);
    expect(guide.actions).toBe(6);
  });

  it("completes campaign only from a logged Campaign action", () => {
    expect(doneIds(deriveSingleplayerGuide(input()))).not.toContain("campaign");
    expect(doneIds(deriveSingleplayerGuide(input({ hasCampaignActed: true })))).toContain(
      "campaign"
    );
  });

  it("completes party when the character belongs to a real party", () => {
    const joined = deriveSingleplayerGuide(
      input({ character: { ...character, party: "Democratic Party" } })
    );
    expect(doneIds(joined)).toContain("party");
    expect(joined.steps.find((s) => s.id === "party")?.href).toBe("/country/us/parties");
  });

  it("drops the party step where no party exists, unless already joined", () => {
    const none = deriveSingleplayerGuide(input({ partiesAvailable: false }));
    expect(none.steps.map((s) => s.id)).not.toContain("party");
    const joined = deriveSingleplayerGuide(
      input({ partiesAvailable: false, character: { ...character, party: "Some Party" } })
    );
    expect(joined.steps.map((s) => s.id)).toContain("party");
  });

  it("completes end-turn only once the world is past the creation turn", () => {
    expect(doneIds(deriveSingleplayerGuide(input({ currentTurn: 4 })))).not.toContain("end-turn");
    expect(doneIds(deriveSingleplayerGuide(input({ currentTurn: 5 })))).toContain("end-turn");
  });

  it("never completes end-turn for a character without a creation turn", () => {
    const guide = deriveSingleplayerGuide(
      input({ character: { ...character, createdTurn: undefined }, currentTurn: 50 })
    );
    expect(doneIds(guide)).not.toContain("end-turn");
  });

  it("completes inbox from the stored visit", () => {
    const guide = deriveSingleplayerGuide(
      input({ config: { mode: "normal", guide: { inboxOpenedAt: new Date() } } })
    );
    expect(doneIds(guide)).toContain("inbox");
  });

  it("reports complete only when every listed step is done", () => {
    const all = deriveSingleplayerGuide(
      input({
        config: { mode: "normal", guide: { inboxOpenedAt: new Date() } },
        character: { ...character, party: "Some Party" },
        hasCampaignActed: true,
        currentTurn: 5,
      })
    );
    expect(singleplayerGuideComplete(all)).toBe(true);
    expect(singleplayerGuideComplete(deriveSingleplayerGuide(input()))).toBe(false);
    expect(
      singleplayerGuideComplete(deriveSingleplayerGuide(input({ config: { mode: "normal" } })))
    ).toBe(false);
  });
});
