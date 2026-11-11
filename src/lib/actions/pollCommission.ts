import { loadCampaignPriceLevel } from "@/lib/campaigns/campaignCurrency";
import { loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";
import { turnoutForElection } from "@/lib/campaignTargeting/rules";
import { projectCampaignPoll } from "@/lib/campaignTargeting/poll";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { canPerformAction } from "@/lib/actions";
import {
  getPollActionCost,
  getPollBaseFundCost,
  quotePollAction,
  type PollTier,
} from "@/lib/actions/rules";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { localCampaignBalance } from "@/lib/currency/campaignBalance";
import { campaignLocalRate } from "@/lib/campaigns/campaignCurrency";
import { getGameState } from "@/lib/gameState";
import {
  buildGranularPollPayloadForState,
  type GranularPollPayload,
} from "@/lib/actions/granularPollPayload";
import { computeInRaceVotes, computePollHeadline } from "@/lib/actions/granularPollPayload/rules";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { clampPercentStat } from "@/lib/numeric/rules";
import { eraYearContextFromGameState } from "@/lib/era/context";
import type {
  State,
  StatePartyOrg,
  StateDemographicTurnout,
  ActionLog,
  User,
} from "@/lib/db/types";
import { computeStateDemographicTurnout } from "@/lib/seeds/stateDemographics";
import { getElectionOpponents } from "@/lib/actions/electionOpponents";
import { loadPollPartyColors } from "@/lib/actions/pollPartyColors";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import type { CountryId } from "@/lib/constants/countries";
import type { PersonalStatTenureContext } from "@/lib/elections/rules/tenureRetention";
import {
  isHeadOfGovernmentRace,
  resolvePresidentApproval,
} from "@/lib/elections/engine/presidentialCoattail";
import { getPresidentialConsecutiveTerms } from "@/lib/elections/resolution/presidentialTenureLedger";
import { charactersCollection } from "@/lib/db/repositories/characters";

// Poll pricing lives in the shared rules module: quotePollAction is the single
// source of truth the effect, validation and the POST debit all call.
// getPollBaseFundCost is the display-only fallback when the quote rejects
// (unallocated intellect); execution never prices from it.

/** Poll eligibility, stored results and demographic context for the account's active character. */
export async function buildPollOverview({
  userId,
  pollType,
}: {
  userId: string;
  pollType: PollTier;
}) {
  const db = await getDb();
  const priceLevel = await loadCampaignPriceLevel(db);
  const campaignRates = await loadCampaignCurrencyRates(db);

  // Resolve active character (admin accounts may have multiple characters)
  const userDoc = await db.collection<User>("users").findOne({ _id: new ObjectId(userId) });
  const characterQuery = userDoc?.activeCharacterId
    ? { _id: userDoc.activeCharacterId, userId: new ObjectId(userId) }
    : { userId: new ObjectId(userId) };
  const character = await charactersCollection(db).findOne(characterQuery);
  if (!character) {
    return errorResponse(404, "Character not found");
  }

  const [state, statePartyOrgs, turnoutDoc, forexEnabled] = await Promise.all([
    db
      .collection<State>("states")
      .findOne({ _id: character.homeState, countryId: character.countryId }),
    db
      .collection<StatePartyOrg>("statePartyOrg")
      .find({ countryId: character.countryId, stateId: character.homeState })
      .toArray(),
    db
      .collection<StateDemographicTurnout>("stateDemographicTurnout")
      .findOne({ _id: character.homeState, countryId: character.countryId }),
    isForexEnabled(),
  ]);

  if (!state) {
    return errorResponse(404, "State not found");
  }

  const userEP = character.policies.economic;
  const userSP = character.policies.social;
  const favorability = character.favorability;
  const politicalInfluence = character.politicalInfluence ?? 0;

  // Same rules quote the server debits on POST: intellect-scaled fund cost
  // per tier. When the quote rejects (unallocated intellect) the unscaled
  // base keeps the price displayable; commissioning is still blocked and
  // POST rejects with the quote reason.
  const pollTier: PollTier = pollType === "large" ? "large" : "small";
  const smallQuote = quotePollAction(
    { intellect: character.stats?.intellect },
    "small",
    priceLevel
  );
  const largeQuote = quotePollAction(
    { intellect: character.stats?.intellect },
    "large",
    priceLevel
  );

  // Look up party organization for the character's party in their home state
  const partyOrgRecord = statePartyOrgs.find((po) => po.partyId === character.party);
  const partyOrgValue = partyOrgRecord?.organization;

  const tierQuote = pollTier === "large" ? largeQuote : smallQuote;
  const fundCost = tierQuote.ok ? tierQuote.fundCostAnchor : getPollBaseFundCost(pollTier);
  const actionCost = getPollActionCost(pollTier);
  const smallFundCost = smallQuote.ok ? smallQuote.fundCostAnchor : getPollBaseFundCost("small");
  const largeFundCost = largeQuote.ok ? largeQuote.fundCostAnchor : getPollBaseFundCost("large");

  // Retrieve the stored poll (if any) so the UI can display it without re-commissioning
  const storedPollKey = pollType === "large" ? "lastPollLarge" : "lastPoll";
  let storedPoll = (character as Record<string, unknown>)[storedPollKey] as
    | {
        takenAt: Date;
        overallAppeal: number;
        totalEstimatedVoters: number;
        totalPotentialVoters: number;
        granular?: unknown;
      }
    | undefined;

  // The granular electorate is the only poll shape. A stored snapshot without
  // it predates the bucket model and cannot be displayed.
  if (storedPoll && !storedPoll.granular) {
    await charactersCollection(db).updateOne(
      { _id: character._id },
      { $unset: { [storedPollKey]: 1 } }
    );
    storedPoll = undefined;
  }

  const electionContext = await getElectionOpponents(character);
  const demographicTurnout = computeStateDemographicTurnout(
    character.homeState,
    // Age-aware electorate (P1b-1c): turnout is computed over the voting-age
    // population, matching the real tally; falls back to total on unseeded worlds.
    state.votingEligiblePopulation ?? state.population,
    "2019",
    turnoutForElection(turnoutDoc, electionContext ?? {})?.modifiers
  );

  // Campaign funds are decoupled from live forex: poll costs (anchor
  // constants) convert to local at the frozen world-seeded currency basis.
  const campaignRate = forexEnabled
    ? campaignLocalRate(character.countryId ?? "US", campaignRates)
    : 1;

  const toLocal = (anchor: number) => Math.round(forexEnabled ? anchor * campaignRate : anchor);

  const partyColors = await loadPollPartyColors(db, character.countryId ?? "US", [
    character.party,
    ...(electionContext?.opponents?.map((o) => o.party) ?? []),
  ]);

  const base = {
    pollType,
    homeState: character.homeState,
    stateName: state.name,
    statePopulation: state.population,
    character: {
      economicPosition: userEP,
      socialPosition: userSP,
      favorability,
      politicalInfluence,
      ...(partyOrgValue != null && { partyOrg: partyOrgValue }),
    },
    fundCost,
    actionCost,
    fundCostSmall: smallFundCost,
    fundCostLarge: largeFundCost,
    // LOCAL twins of the anchor quotes at the frozen campaign rate, the exact
    // amounts POST debits, so the page never prices at live forex or shows ₳.
    fundCostLocal: toLocal(fundCost),
    fundCostSmallLocal: toLocal(smallFundCost),
    fundCostLargeLocal: toLocal(largeFundCost),
    // Flat canonical AP cost per tier, same owner as hasActions* below, so
    // the page tier cards can never restate a stale literal.
    actionCostSmall: getPollActionCost("small"),
    actionCostLarge: getPollActionCost("large"),
    // Quoted costs are ANCHOR; the character balance is LOCAL. Convert at
    // the boundary for comparison.
    canAffordSmall:
      localCampaignBalance(character, forexEnabled) >=
      (forexEnabled ? smallFundCost * campaignRate : smallFundCost),
    canAffordLarge:
      localCampaignBalance(character, forexEnabled) >=
      (forexEnabled ? largeFundCost * campaignRate : largeFundCost),
    hasActionsSmall: character.actions >= getPollActionCost("small"),
    hasActionsLarge: character.actions >= getPollActionCost("large"),
    // Stored results from the last commissioned poll
    storedPoll: storedPoll
      ? {
          ...storedPoll,
          takenAt:
            storedPoll.takenAt instanceof Date
              ? storedPoll.takenAt.toISOString()
              : storedPoll.takenAt,
        }
      : null,
    electionContext,
    demographicTurnout,
    partyColors,
    myParty: character.party ?? null,
  };

  return NextResponse.json(base);
}

/** Charges for and persists a quick or full poll for the account's active character. */
export async function commissionPoll({ userId, pollType }: { userId: string; pollType: PollTier }) {
  const actionKey = pollType === "large" ? "pollLarge" : "poll";
  const tier: PollTier = pollType === "large" ? "large" : "small";

  const db = await getDb();
  const priceLevel = await loadCampaignPriceLevel(db);
  const campaignRates = await loadCampaignCurrencyRates(db);

  // Resolve active character (admin accounts may have multiple characters)
  const userDoc = await db.collection<User>("users").findOne({ _id: new ObjectId(userId) });
  const characterQuery = userDoc?.activeCharacterId
    ? { _id: userDoc.activeCharacterId, userId: new ObjectId(userId) }
    : { userId: new ObjectId(userId) };
  const [character, forexEnabled] = await Promise.all([
    charactersCollection(db).findOne(characterQuery),
    isForexEnabled(),
  ]);
  if (!character) {
    return errorResponse(404, "Character not found");
  }

  // Price the debit from the same quote the effect and validation use. A
  // missing intellect rejects here before any state is read or charged.
  const quote = quotePollAction({ intellect: character.stats?.intellect }, tier, priceLevel);
  if (!quote.ok) {
    return errorResponse(400, quote.error);
  }
  const fundCost = quote.fundCostAnchor;
  const actionCost = quote.apCost;

  const gameState = await getGameState();
  // Campaign funds are decoupled from live forex: poll costs convert at the
  // frozen world-seeded currency basis, never the live exchangeRates.
  const campaignRate = forexEnabled
    ? campaignLocalRate(character.countryId ?? "US", campaignRates)
    : 1;

  const validation = canPerformAction(character, actionKey, undefined, {
    forexEnabled,
    homeFxRate: campaignRate,
    priceLevel,
  });
  if (!validation.canPerform) {
    return errorResponse(400, validation.reason);
  }

  // Compute the poll results now so we can persist them
  const [state, statePartyOrgs, turnoutDoc] = await Promise.all([
    db
      .collection<State>("states")
      .findOne({ _id: character.homeState, countryId: character.countryId }),
    db
      .collection<StatePartyOrg>("statePartyOrg")
      .find({ countryId: character.countryId, stateId: character.homeState })
      .toArray(),
    db.collection<StateDemographicTurnout>("stateDemographicTurnout").findOne({
      _id: character.homeState,
      countryId: character.countryId,
    }),
  ]);

  // Validate before charging: never charge if we cannot produce poll data
  if (!state) {
    return errorResponse(404, `State not found for ${character.homeState}. Contact support.`);
  }
  const electionContext = await getElectionOpponents(character);
  const campaignProjection = electionContext
    ? await projectCampaignPoll(
        db,
        electionContext.electionId,
        character,
        turnoutDoc,
        statePartyOrgs,
        electionContext.inPrimary
      )
    : null;

  // The granular electorate is the poll: it is the substrate the vote engines
  // count. Built before charging so a world with no census model never debits.
  let granularPayload: GranularPollPayload;
  try {
    const countryId = state.countryId ?? "US";
    const isPresidentialGeneral =
      electionContext != null &&
      !electionContext.inPrimary &&
      isHeadOfGovernmentRace(electionContext.electionType, countryId as CountryId);
    const presidentialIncumbent = isPresidentialGeneral
      ? await resolvePresidentApproval(db, countryId as CountryId)
      : null;
    const executiveConsecutiveTerms = isPresidentialGeneral
      ? getPresidentialConsecutiveTerms(
          gameState,
          countryId as CountryId,
          presidentialIncumbent?.partyId
        )
      : 0;
    const incumbency: PersonalStatTenureContext | undefined =
      electionContext?.incumbency || presidentialIncumbent
        ? {
            ...electionContext?.incumbency,
            ...(presidentialIncumbent
              ? {
                  executivePartyId: presidentialIncumbent.partyId,
                  executiveConsecutiveTerms,
                }
              : {}),
          }
        : undefined;
    const preset = gameState?.preset ?? DEFAULT_SEED_PRESET;
    // Live era clock: the poll must describe the SAME electorate the vote
    // engines are counting, so it reads the year through the same gate.
    const pollEraYear = eraYearContextFromGameState(gameState);
    granularPayload = buildGranularPollPayloadForState({
      campaign: campaignProjection ?? undefined,
      countryId,
      stateId: state._id as string,
      preset,
      era: pollEraYear.year != null ? undefined : eraForPreset(preset),
      year: pollEraYear.year,
      startingYear: pollEraYear.startingYear,
      character: {
        candidateId: electionContext?.candidateId,
        party: character.party,
        economicPosition: character.policies.economic,
        socialPosition: character.policies.social,
        favorability: character.favorability,
        bucketApprovals: character.bucketApprovals,
        politicalInfluence: character.politicalInfluence ?? 0,
        nationalInfluence: character.nationalInfluence,
      },
      opponents:
        electionContext?.opponents?.map((o) => ({
          candidateId: o.candidateId,
          name: o.name ?? o.candidateId,
          party: o.party,
          economicPosition: o.economicPosition,
          socialPosition: o.socialPosition,
          favorability: o.favorability,
          bucketApprovals: o.bucketApprovals,
          isNPP: o.isNPP,
          politicalInfluence: o.politicalInfluence,
          nationalInfluence: o.nationalInfluence,
        })) ?? [],
      incumbency,
      useNationalInfluenceForReach: isPresidentialGeneral,
    });
  } catch (err) {
    console.error("[poll] granular payload failed:", err);
    return errorResponse(
      400,
      "Polling is not available for your state yet: no electorate data was found."
    );
  }

  const statePopulation = state.votingEligiblePopulation ?? state.population;
  const headline = computePollHeadline(granularPayload.cells, statePopulation, {
    economicPosition: character.policies.economic,
    socialPosition: character.policies.social,
    favorability: character.favorability,
    politicalInfluence: clampPercentStat(character.politicalInfluence ?? 0),
    approvalBuckets: character.bucketApprovals ?? {},
  });
  const inRaceVoteShare = campaignProjection
    ? {
        myVotes: campaignProjection.votes[campaignProjection.myCandidateId] ?? 0,
        opponentVotes: Object.fromEntries(
          Object.entries(campaignProjection.votes).filter(
            ([id]) => id !== campaignProjection.myCandidateId
          )
        ),
      }
    : electionContext?.opponents.length
      ? computeInRaceVotes(granularPayload.cells, granularPayload.candidateShares, statePopulation)
      : undefined;
  const pollSnapshot: Record<string, unknown> = {
    takenAt: new Date(),
    overallAppeal: headline.overallAppeal,
    totalEstimatedVoters: campaignProjection?.totalPool ?? headline.totalEstimatedVoters,
    totalPotentialVoters: headline.totalPotentialVoters,
    ...(inRaceVoteShare && { inRaceVoteShare }),
    granular: granularPayload,
  };

  const storedPollKey = pollType === "large" ? "lastPollLarge" : "lastPoll";

  // fundCost is ANCHOR; convert to LOCAL (frozen rate) for filter + $inc.
  const fundCostLocal = forexEnabled ? fundCost * campaignRate : fundCost;
  const campaignFundsField = forexEnabled ? "currencyBalances.campaign" : "funds";
  const spendFilter = {
    _id: character._id,
    actions: { $gte: actionCost },
    [campaignFundsField]: { $gte: fundCostLocal },
  };
  const spendResult = await charactersCollection(db).updateOne(spendFilter, {
    $inc: {
      actions: -actionCost,
      [campaignFundsField]: -fundCostLocal,
    },
    $set: {
      updatedAt: new Date(),
      ...(pollSnapshot ? { [storedPollKey]: pollSnapshot } : {}),
    },
  });
  if (spendResult.modifiedCount === 0) {
    return errorResponse(
      409,
      "Your available actions or campaign funds changed. Please try again."
    );
  }

  const actionLog: Omit<ActionLog, "_id"> = {
    characterId: character._id,
    userId: new ObjectId(userId),
    actionType: actionKey,
    actionCost,
    result: {
      success: true,
      fundsChange: -fundCost,
      message:
        pollType === "large"
          ? `Commissioned a full demographic poll for $${fundCost.toLocaleString()}.`
          : `Commissioned a quick poll for $${fundCost.toLocaleString()}.`,
    },
    turn: gameState?.currentTurn || 0,
    createdAt: new Date(),
    characterName: character.name,
    username: userDoc?.username,
    countryId: character.countryId,
  };
  await db.collection("actionLogs").insertOne(actionLog);

  try {
    const { checkActionAchievements } = await import("@/lib/achievements/triggers");
    await checkActionAchievements(new ObjectId(userId), character._id, actionKey);
  } catch (e) {
    console.error("Achievement check failed:", e);
  }

  const updatedCharacter = await charactersCollection(db).findOne({
    _id: character._id,
  });

  return NextResponse.json({
    success: true,
    message:
      pollType === "large"
        ? `Full poll commissioned for $${fundCost.toLocaleString()}.`
        : `Quick poll commissioned for $${fundCost.toLocaleString()}.`,
    character: updatedCharacter,
    pollSnapshot,
  });
}
