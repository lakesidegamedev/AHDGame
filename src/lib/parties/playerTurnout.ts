import { getStateDemographicTurnoutCollection } from "@/lib/db/collections";
import type { StateDemographicTurnout } from "@/lib/db/types";

import { decayTurnout, canvassingBoost } from "@/lib/campaignTargeting/rules";
import { applyDecay } from "@/lib/utils/turnoutDecay";

import { ObjectId } from "mongodb";
import { applyBoost, calculateCanvassingBoost } from "@/lib/turn/demographicTurnoutCalculations";
import { resolvePartyTurnoutTargetLean } from "@/lib/demographics/partyTurnoutTargetResolver";

import { logger } from "@/lib/observability/logger";

/**
 * Apply decay to all demographic modifiers in all states.
 * Called at the start of each turn.
 *
 * @param states - Optional array of states for testing. If not provided, fetches from DB.
 * @returns Array of states with decayed modifiers and updated timestamps
 */
export async function applyDecayToAllStates(
  states?: StateDemographicTurnout[]
): Promise<StateDemographicTurnout[]> {
  // For testing, accept states array; otherwise fetch from DB
  let turnoutData: StateDemographicTurnout[];
  let collection;

  if (states) {
    // Deep copy for testing to avoid mutation (JSON method preserves types correctly)
    turnoutData = JSON.parse(JSON.stringify(states)) as StateDemographicTurnout[];
  } else {
    try {
      collection = await getStateDemographicTurnoutCollection();
      turnoutData = await collection.find({}).toArray();

      if (turnoutData.length === 0) {
        logger.warn("Demographic Turnout Turn", "No state demographic data found");
        return [];
      }
    } catch (error) {
      logger.error("Demographic Turnout Turn", "Error fetching state data", error);
      throw error;
    }
  }

  const results: StateDemographicTurnout[] = [];

  for (const state of turnoutData) {
    state.campaignModifiers = decayTurnout(state.campaignModifiers ?? state.modifiers);
    if (state.campaignContactModifiers) {
      state.campaignContactModifiers = decayTurnout(state.campaignContactModifiers);
    }
    const modifiers = state.modifiers;

    // Apply decay to all categories.
    // Iterates dynamically over whatever category keys exist in the document —
    // supports both legacy US documents (race/age/education/wealth/ideology) and
    // new country-specific documents (e.g. UK voterGroups).
    for (const category of Object.keys(modifiers)) {
      const categoryModifiers = modifiers[category] as Record<string, number>;
      if (!categoryModifiers || typeof categoryModifiers !== "object") continue;
      for (const group of Object.keys(categoryModifiers)) {
        categoryModifiers[group] = applyDecay(categoryModifiers[group]);
      }
    }

    state.lastDecayApplied = new Date();
    state.lastUpdated = new Date();

    results.push(state);
  }

  // Bulk update DB if not in test mode
  if (!states && collection && results.length > 0) {
    try {
      const ops = results.map((state) => ({
        updateOne: {
          filter: { _id: state._id },
          update: {
            $set: {
              modifiers: state.modifiers,
              ...(state.campaignModifiers ? { campaignModifiers: state.campaignModifiers } : {}),
              ...(state.campaignContactModifiers
                ? { campaignContactModifiers: state.campaignContactModifiers }
                : {}),
              lastDecayApplied: state.lastDecayApplied,
              lastUpdated: state.lastUpdated,
            },
          },
        },
      }));
      await collection.bulkWrite(ops);
    } catch (error) {
      logger.error("Demographic Turnout Turn", "Error updating state data", error);
      throw error;
    }
  }

  return results;
}

export interface CanvassingAction {
  characterId: ObjectId;
  stateId: string;
  demographic: { category: string; group: string };
  characterPosition: { economic: number; social: number };
  costFunds: number;
  costActions: number;
  isActiveCampaignSeason: boolean;
}

/**
 * Process player canvassing actions.
 * Applies boosts scaled by alignment and campaign season.
 *
 * @param actions - Optional array of canvassing actions for testing. If not provided, fetches from action queue.
 * @param turnoutData - Optional array of turnout data for testing. If not provided, fetches from DB.
 * @returns Updated turnout data
 */
export async function processPlayerCanvassing(
  actions?: CanvassingAction[],
  turnoutData?: StateDemographicTurnout[]
): Promise<StateDemographicTurnout[]> {
  let turnoutCollection;

  // For testing, accept arrays; otherwise fetch from DB
  let stateTurnout: StateDemographicTurnout[];

  if (turnoutData) {
    // Deep copy for testing to avoid mutation (JSON method preserves types correctly)
    stateTurnout = JSON.parse(JSON.stringify(turnoutData)) as StateDemographicTurnout[];
  } else {
    try {
      turnoutCollection = await getStateDemographicTurnoutCollection();
      stateTurnout = await turnoutCollection.find({}).toArray();
    } catch (error) {
      logger.error("Demographic Turnout Turn", "Error fetching turnout data", error);
      throw error;
    }
  }

  // Get canvassing actions for this turn (from action queue)
  const canvassingActions = actions ?? (await getCanvassingActionsForTurn());

  for (const action of canvassingActions) {
    const state = stateTurnout.find((s) => s._id === action.stateId);
    if (!state) continue;

    const canvassLean = resolvePartyTurnoutTargetLean(
      state.countryId,
      action.demographic.category,
      action.demographic.group
    );
    const demoLean = canvassLean
      ? { economic: canvassLean.economicLean, social: canvassLean.socialLean }
      : { economic: 0, social: 0 };

    // Calculate effectiveness
    const boost = calculateCanvassingBoost(
      action.characterPosition,
      demoLean,
      action.isActiveCampaignSeason
    );

    // Apply with diminishing returns
    applyBoost(
      state,
      action.demographic,
      boost,
      canvassingBoost(
        {
          economicLean: action.characterPosition.economic,
          socialLean: action.characterPosition.social,
        },
        { economicLean: demoLean.economic, socialLean: demoLean.social },
        action.isActiveCampaignSeason
      )
    );
    state.lastUpdated = new Date();
  }

  // Save changes
  if (!turnoutData && turnoutCollection && stateTurnout.length > 0) {
    try {
      const ops = stateTurnout.map((state) => ({
        updateOne: {
          filter: { _id: state._id },
          update: {
            $set: {
              modifiers: state.modifiers,
              ...(state.campaignModifiers ? { campaignModifiers: state.campaignModifiers } : {}),
              ...(state.campaignContactModifiers
                ? { campaignContactModifiers: state.campaignContactModifiers }
                : {}),
              lastUpdated: state.lastUpdated,
            },
          },
        },
      }));
      await turnoutCollection.bulkWrite(ops);
    } catch (error) {
      logger.error("Demographic Turnout Turn", "Error updating turnout data", error);
      throw error;
    }
  }

  return stateTurnout;
}

export /**
 * Canvassing effects are applied immediately at action time via /api/canvassing,
 * not queued for turn processing. This function exists as a placeholder from an
 * earlier design that was superseded by immediate application.
 */
async function getCanvassingActionsForTurn(): Promise<CanvassingAction[]> {
  return [];
}
