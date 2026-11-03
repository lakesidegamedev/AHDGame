/**
 * Market entry: can a corporation found its first plant in a (state, lane)
 * market right now, and what does it cost?
 *
 * Pure rules. The founding command (`expandSector`) is the authority that
 * enforces these, and the expansion picker (`expand-suggestions`) shows the
 * same verdict per market, so the screen cannot offer a market the command
 * refuses or hide one it accepts. Both shells load the facts and call here.
 *
 * Room to build (unmet demand) is deliberately NOT an entry rule. The command
 * accepts a first plant into a market with no unmet demand; the plant then
 * competes with current producers for sales. The screen shows that figure as
 * advice next to the verdict, never as a gate.
 */
import {
  CAPACITY_BUILD_TURNS,
  computeBuildCost,
  techBuildTurns,
} from "@/lib/constants/capacityEconomy";
import type { OperatingSectorIdentity } from "@/lib/constants/corporationsClient";
import { foundingStarterUnits, sectorEntryFeeAnchor } from "@/lib/corporations/foundingPlant";

/** Why a market cannot be entered right now, in the order the command checks. */
export type MarketEntryBlockReason =
  | "actions_paused"
  | "player_control_required"
  | "command_economy"
  | "already_operating"
  | "retail_paused"
  | "insufficient_capital";

export interface MarketEntryFacts {
  /** World-level corporation-actions pause message, null when actions run. */
  actionsPausedMessage: string | null;
  /** The corporation is run by its non-player management (ceoType "npp"). */
  nppControlled: boolean;
  /** The host country runs production through the state. */
  commandEconomy: boolean;
  /** The corporation already has a sector in this (state, lane) market. */
  alreadyOperating: boolean;
  /** Turns left on the Retail pause; null when not paused (or not Retail). */
  retailPauseTurnsRemaining: number | null;
  /** Corporation cash, in the anchor currency. */
  liquidCapitalAnchor: number;
  /**
   * All-in founding charge (entry fee + first plant + any FX spread) in the
   * anchor currency. Null skips the capital check, for callers that check the
   * cheaper gates before pricing the build.
   */
  entryCostAnchor: number | null;
}

export type MarketEntryVerdict =
  | { canEnter: true; reason: null; message: null }
  | { canEnter: false; reason: MarketEntryBlockReason; message: string };

const OPEN: MarketEntryVerdict = { canEnter: true, reason: null, message: null };

function blocked(reason: MarketEntryBlockReason, message: string): MarketEntryVerdict {
  return { canEnter: false, reason, message };
}

/** Player-facing explanation for a refusal. */
export function marketEntryMessage(
  reason: MarketEntryBlockReason,
  facts: Pick<MarketEntryFacts, "actionsPausedMessage" | "retailPauseTurnsRemaining"> = {
    actionsPausedMessage: null,
    retailPauseTurnsRemaining: null,
  }
): string {
  switch (reason) {
    case "actions_paused":
      return facts.actionsPausedMessage ?? "Corporation actions are currently paused.";
    case "player_control_required":
      return "Resume player control before building plants for this corporation";
    case "command_economy":
      return "This market is state-controlled under a command economy and is closed to private sector expansion.";
    case "already_operating":
      return "You already have operations in this state";
    case "retail_paused":
      return `New Retail sectors are paused while consumer demand is rebalanced (${facts.retailPauseTurnsRemaining ?? 0} turns remaining).`;
    case "insufficient_capital":
      return "You do not have enough capital for the entry fee and first plant.";
  }
}

/**
 * First refusal that applies, or open. Checked in the command's order so the
 * screen names the same reason the command would return.
 */
export function evaluateMarketEntry(facts: MarketEntryFacts): MarketEntryVerdict {
  const order: [boolean, MarketEntryBlockReason][] = [
    [facts.actionsPausedMessage != null, "actions_paused"],
    [facts.nppControlled, "player_control_required"],
    [facts.commandEconomy, "command_economy"],
    [facts.alreadyOperating, "already_operating"],
    [facts.retailPauseTurnsRemaining != null, "retail_paused"],
    [
      facts.entryCostAnchor != null &&
        !(
          Number.isFinite(facts.liquidCapitalAnchor) &&
          facts.liquidCapitalAnchor >= facts.entryCostAnchor
        ),
      "insufficient_capital",
    ],
  ];
  for (const [applies, reason] of order) {
    if (applies) return blocked(reason, marketEntryMessage(reason, facts));
  }
  return OPEN;
}

/** Inputs to {@link quoteFoundingEntry}. Tech effects are lane-scoped by the caller. */
export interface FoundingQuoteInputs {
  identity: OperatingSectorIdentity;
  preset: string | undefined;
  currentYear: number;
  eraUnitScale: number;
  /** Tech-tree entry-fee discount, a fraction in [0, 1]. */
  techExpansionDiscount: number;
  /** Tech-tree build-price multiplier (1 = no tech). Also shortens the build. */
  techGrowthCostMultiplier: number;
  /** Tech-tree dominance shield after strength upkeep. */
  techDominanceShield: number;
  /** The corporation's share of this industry in the host country. */
  nationalMarketSharePercent: number;
  /** Host country prime rate (%). */
  primeRate: number;
  /** CEO Business Acumen. */
  acumen: number;
  /** Host state's cost-of-living index, null when unknown. */
  hostCostOfLivingIndex: number | null;
}

export interface FoundingQuote {
  /** Land, permits and licences. */
  entryFeeAnchor: number;
  /** Capacity the first plant delivers, output units per day. */
  starterUnits: number;
  /** Discounted price of the first plant. */
  starterBuildAnchor: number;
  /** Turns until the first plant comes online. */
  buildTurns: number;
  /** Entry fee plus first plant, before any cross-currency spread. */
  baseCostAnchor: number;
}

/**
 * What founding costs: an era-scaled entry fee plus one discounted facility.
 * The command charges exactly this and the picker quotes exactly this.
 */
export function quoteFoundingEntry(inputs: FoundingQuoteInputs): FoundingQuote {
  const { sectorType, industryModel, mediaDiscriminator } = inputs.identity;
  const entryFeeAnchor = sectorEntryFeeAnchor(inputs.preset, inputs.techExpansionDiscount);
  const starterUnits = foundingStarterUnits(sectorType, industryModel, mediaDiscriminator);
  const starterBuildAnchor = computeBuildCost({
    sectorType,
    industryModel,
    mediaDiscriminator,
    units: starterUnits,
    // A founded sector has no chosen production method yet, so it runs and is
    // priced at the sector-type default.
    strategyId: null,
    year: inputs.currentYear,
    preset: inputs.preset,
    eraUnitScale: inputs.eraUnitScale,
    // No local sector yet, but national dominance follows the incumbent in.
    marketSharePercent: 0,
    nationalMarketSharePercent: inputs.nationalMarketSharePercent,
    primeRate: inputs.primeRate,
    acumen: inputs.acumen,
    hostCostOfLivingIndex: inputs.hostCostOfLivingIndex,
    techGrowthCostMultiplier: inputs.techGrowthCostMultiplier,
    techDominanceShield: inputs.techDominanceShield,
    founding: true,
  }).totalAnchor;
  const buildTurns = techBuildTurns(
    CAPACITY_BUILD_TURNS(sectorType, true),
    inputs.techGrowthCostMultiplier
  );
  return {
    entryFeeAnchor,
    starterUnits,
    starterBuildAnchor,
    buildTurns,
    baseCostAnchor: entryFeeAnchor + starterBuildAnchor,
  };
}
