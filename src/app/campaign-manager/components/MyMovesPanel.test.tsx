// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { makeCharacter } from "@/lib/test-utils/factories";
import { buildRaceIndex } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { CARDS } from "@/app/actions/actionsConstants";
import type { ActionCardProps } from "@/app/actions/actionsTypes";
import type { ActionsController } from "@/app/actions/useActionsController";
import { MyMovesPanel } from "./MyMovesPanel";

// The Actions card itself is covered by the Actions page's tests; here it only
// has to show which card it is and run the batch it was wired to.
vi.mock("@/app/actions/components/ActionCardCompact", () => ({
  default: ({ card, onExecute }: ActionCardProps) => (
    <button type="button" onClick={() => onExecute(card.type, 5)}>
      {card.label} ×5
    </button>
  ),
}));
vi.mock("@/app/actions/components/CampaignActionModal", () => ({
  CampaignActionModal: () => null,
}));

afterEach(cleanup);

function controller(over: Partial<ActionsController> = {}): ActionsController {
  const character = makeCharacter({
    politicalInfluence: 42,
    favorability: 54,
    infamy: 21,
    donorBaseLevel: 3,
    stats: { charisma: 5, debate: 4, energy: 5, fundraising: 5, intellect: 5, oratory: 5 } as never,
  });
  return {
    character,
    homeState: null,
    ready: true,
    era: "2019",
    eraLabel: "2019",
    countryId: "US",
    executing: null,
    flash: null,
    flipflopStep: null,
    flipflopAxis: null,
    flipflopDir: null,
    setFlipflopStep: vi.fn(),
    setFlipflopAxis: vi.fn(),
    setFlipflopDir: vi.fn(),
    convertCashOpen: false,
    convertCashAmount: "",
    setConvertCashOpen: vi.fn(),
    setConvertCashAmount: vi.fn(),
    campaignAction: null,
    setCampaignAction: vi.fn(),
    execute: vi.fn(async () => {}),
    executeFlipflop: vi.fn(async () => {}),
    executeConvertCash: vi.fn(async () => {}),
    fetchCharacter: vi.fn(async () => {}),
    actionCosts: {
      fundraiseAmount: 1000,
      donorUpgradeCost: 1000,
      campaignActionCost: 2,
      campaignFundCost: 100,
      campaignMaxed: false,
      advertiseActionCost: 2,
      advertiseFundCost: 100,
      fundraiseActionCost: 3,
      buildDonorBaseActionCost: 4,
      buildDonorBaseFundCost: 100,
      campaignInfluenceGain: 1,
      advertiseFavorabilityGain: 1,
    },
    projections: {},
    forexEnabled: false,
    displayCampaignFundsStored: 10_000,
    displayCampaignFunds: 10_000,
    displayPersonalWealth: 50_000,
    blockGdpScaledCosts: false,
    cards: CARDS,
    cardImages: {},
    ...over,
  };
}

const myRace = buildRaceIndex(
  [
    election({
      cands: [
        { id: "a", name: "A", party: "2", share: 40.4 },
        { id: "b", name: "Me", party: "1", share: 36.4, isYou: true },
        { id: "c", name: "C", party: "3", share: 23.2 },
      ],
    }),
  ],
  { currentTurn: 10, nationalChamberKeys: ["senate"] }
)[0];

describe("MyMovesPanel", () => {
  it("shows the player's stats, with infamy flagged above 20", () => {
    renderWithElectionsMessages(
      <MyMovesPanel
        controller={controller()}
        myRace={myRace}
        myRaceTitle="Ohio Senate"
        onOpenRace={() => {}}
      />
    );
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("54%")).toBeTruthy();
    expect(screen.getByText("Lv 3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(
      screen.getByTitle("Infamy above 20 drains favorability every turn").textContent
    ).toContain("21");
  });

  it("summarises the player's race", () => {
    renderWithElectionsMessages(
      <MyMovesPanel
        controller={controller()}
        myRace={myRace}
        myRaceTitle="Ohio Senate"
        onOpenRace={() => {}}
      />
    );
    expect(screen.getByText("2nd · 36.4% · trails by 4.0 pts")).toBeTruthy();
  });

  it("keeps the cards but drops the summary when the player is in no race", () => {
    renderWithElectionsMessages(
      <MyMovesPanel
        controller={controller()}
        myRace={undefined}
        myRaceTitle={null}
        onOpenRace={() => {}}
      />
    );
    expect(screen.queryByText(/trails by|leads by/)).toBeNull();
    expect(screen.getByText(/not running in a race/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Campaign ×5/ })).toBeTruthy();
  });

  it("runs a card's batch through the shared controller", () => {
    const c = controller();
    renderWithElectionsMessages(
      <MyMovesPanel
        controller={c}
        myRace={myRace}
        myRaceTitle="Ohio Senate"
        onOpenRace={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Campaign ×5/ }));
    expect(c.execute).toHaveBeenCalledWith("campaign", 5);
  });

  it("waits for the controller before drawing cards", () => {
    renderWithElectionsMessages(
      <MyMovesPanel
        controller={controller({ ready: false, character: null })}
        myRace={myRace}
        myRaceTitle="Ohio Senate"
        onOpenRace={() => {}}
      />
    );
    expect(screen.getByText("Loading your actions")).toBeTruthy();
  });
});
