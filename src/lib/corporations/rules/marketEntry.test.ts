import { describe, expect, it } from "vitest";
import {
  CAPACITY_BUILD_TURNS,
  computeBuildCost,
  techBuildTurns,
} from "@/lib/constants/capacityEconomy";
import { foundingStarterUnits, sectorEntryFeeAnchor } from "@/lib/corporations/foundingPlant";
import {
  evaluateMarketEntry,
  marketEntryMessage,
  quoteFoundingEntry,
  type MarketEntryFacts,
} from "./marketEntry";

const OPEN_FACTS: MarketEntryFacts = {
  actionsPausedMessage: null,
  nppControlled: false,
  commandEconomy: false,
  alreadyOperating: false,
  retailPauseTurnsRemaining: null,
  liquidCapitalAnchor: 10_000,
  entryCostAnchor: 5_000,
};

describe("evaluateMarketEntry", () => {
  it("opens a market when no rule refuses it", () => {
    expect(evaluateMarketEntry(OPEN_FACTS)).toEqual({
      canEnter: true,
      reason: null,
      message: null,
    });
  });

  it("refuses while corporation actions are paused, with the pause message", () => {
    const verdict = evaluateMarketEntry({
      ...OPEN_FACTS,
      actionsPausedMessage: "Corporation actions are currently paused by an admin",
    });
    expect(verdict).toEqual({
      canEnter: false,
      reason: "actions_paused",
      message: "Corporation actions are currently paused by an admin",
    });
  });

  it("refuses while the corporation is under non-player management", () => {
    const verdict = evaluateMarketEntry({ ...OPEN_FACTS, nppControlled: true });
    expect(verdict.reason).toBe("player_control_required");
    expect(verdict.message).toBe(
      "Resume player control before building plants for this corporation"
    );
  });

  it("refuses a command-economy host", () => {
    const verdict = evaluateMarketEntry({ ...OPEN_FACTS, commandEconomy: true });
    expect(verdict.reason).toBe("command_economy");
    expect(verdict.message).toContain("command economy");
  });

  it("refuses a market the corporation already operates in", () => {
    const verdict = evaluateMarketEntry({ ...OPEN_FACTS, alreadyOperating: true });
    expect(verdict.reason).toBe("already_operating");
    expect(verdict.message).toBe("You already have operations in this state");
  });

  it("refuses new Retail during the demand unwind and says how long is left", () => {
    const verdict = evaluateMarketEntry({ ...OPEN_FACTS, retailPauseTurnsRemaining: 40 });
    expect(verdict.reason).toBe("retail_paused");
    expect(verdict.message).toContain("40 turns remaining");
  });

  it("refuses when cash is short of the all-in founding charge", () => {
    const verdict = evaluateMarketEntry({ ...OPEN_FACTS, liquidCapitalAnchor: 4_999 });
    expect(verdict.reason).toBe("insufficient_capital");
    expect(verdict.message).toBe(marketEntryMessage("insufficient_capital"));
  });

  it("accepts cash exactly equal to the charge", () => {
    expect(evaluateMarketEntry({ ...OPEN_FACTS, liquidCapitalAnchor: 5_000 }).canEnter).toBe(true);
  });

  it("skips the capital check until the build is priced", () => {
    expect(
      evaluateMarketEntry({ ...OPEN_FACTS, liquidCapitalAnchor: 0, entryCostAnchor: null }).canEnter
    ).toBe(true);
  });

  it("does not gate on room to build: no demand fact exists", () => {
    // A first plant into a market with no unmet demand is allowed; it
    // competes for existing sales. The verdict has no input for it.
    expect(Object.keys(OPEN_FACTS)).not.toContain("roomToBuildUnits");
  });

  it("names the first refusal in the command's order", () => {
    const verdict = evaluateMarketEntry({
      ...OPEN_FACTS,
      nppControlled: true,
      commandEconomy: true,
      alreadyOperating: true,
      retailPauseTurnsRemaining: 3,
      liquidCapitalAnchor: 0,
    });
    expect(verdict.reason).toBe("player_control_required");
    expect(
      evaluateMarketEntry({
        ...OPEN_FACTS,
        alreadyOperating: true,
        retailPauseTurnsRemaining: 3,
        liquidCapitalAnchor: 0,
      }).reason
    ).toBe("already_operating");
  });
});

describe("quoteFoundingEntry", () => {
  it("is the entry fee plus one founding-discounted facility", () => {
    const quote = quoteFoundingEntry({
      identity: {
        sectorType: "manufacturing",
        industryModel: "vehicles",
        mediaDiscriminator: null,
      },
      preset: undefined,
      currentYear: 1991,
      eraUnitScale: 1,
      techExpansionDiscount: 0.2,
      techGrowthCostMultiplier: 0.9,
      techDominanceShield: 0.1,
      nationalMarketSharePercent: 40,
      primeRate: 5,
      acumen: 60,
      hostCostOfLivingIndex: 110,
    });
    const starterUnits = foundingStarterUnits("manufacturing", "vehicles", null);
    const starterBuild = computeBuildCost({
      sectorType: "manufacturing",
      industryModel: "vehicles",
      mediaDiscriminator: null,
      units: starterUnits,
      strategyId: null,
      year: 1991,
      preset: undefined,
      eraUnitScale: 1,
      marketSharePercent: 0,
      nationalMarketSharePercent: 40,
      primeRate: 5,
      acumen: 60,
      hostCostOfLivingIndex: 110,
      techGrowthCostMultiplier: 0.9,
      techDominanceShield: 0.1,
      founding: true,
    }).totalAnchor;
    expect(quote.starterUnits).toBe(starterUnits);
    expect(quote.entryFeeAnchor).toBe(sectorEntryFeeAnchor(undefined, 0.2));
    expect(quote.starterBuildAnchor).toBe(starterBuild);
    expect(quote.baseCostAnchor).toBe(quote.entryFeeAnchor + starterBuild);
    expect(quote.buildTurns).toBe(techBuildTurns(CAPACITY_BUILD_TURNS("manufacturing", true), 0.9));
  });
});
