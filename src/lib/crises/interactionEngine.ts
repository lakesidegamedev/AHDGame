/**
 * Crisis choices authorize country actions and global responses.
 * submitCrisisDecision claims each leader once and preserves humanitarian orders
 * with that response; the population phase later records actual reception and services.
 */
import { prepareRefugeeReceptionOrder } from "@/lib/livingConflict/refugeeReception";
import { applyLivingConflictFallback } from "@/lib/livingConflict/fallbackTrajectory";
import { canCharacterInteract, canRespondToCrisis } from "./rules/authorization";
import { collectiveDurationReduction } from "./rules/collectiveReduction";
import {
  isLegacyDefinitionId,
  leversFromDecisionTree,
  optionAnsweredByLever,
} from "./v2/legacyConvert";
export { canCharacterInteract } from "./rules/authorization";
import { ObjectId, type Db, type UpdateFilter } from "mongodb";
import type {
  Crisis,
  CrisisEffect,
  CrisisInteraction,
  CrisisDecisionNode,
} from "@/lib/db/types/crisis";
import type { FederalBudget, ElectedOfficial } from "@/lib/db/types";
import {
  getCountryConfig,
  getHeadOfStateOfficeType,
  type CountryId,
} from "@/lib/constants/countries";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api/errors";
import { logWireEvent } from "@/lib/wireEvent";
import { applyCrisisEffects } from "./applyEffects";
import { runCrisisOptionAction, type CrisisActionResult } from "./optionActions";
import { spendFromTreasury } from "@/lib/budget/treasurySpend";
import { AID_MAX_PCT_GDP, AID_DEFAULT_PCT_GDP } from "@/lib/constants/crises";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { getBankId } from "@/lib/centralBank/helpers";
import { resolveFinancePosition } from "@/lib/constants/cabinetMonetary";
import { getGameState } from "@/lib/gameState";
import {
  globalResponseRoleFor,
  optionsForGlobalResponder,
  prepareGlobalResponseOption,
  recordGlobalResponseCommitment,
  resolveGlobalResponse,
  spendGlobalResponseCost,
} from "@/lib/livingConflict/globalResponse";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";

/** Read a country's national treasury balance (the unified fiscal cash position). */
async function getTreasuryBalance(db: Db, countryId: string): Promise<number> {
  const budget = await federalBudgetCollection(db).findOne({
    countryId: countryId as FederalBudget["countryId"],
  });
  return budget?.treasuryBalance ?? 0;
}

/** Debit `amount` (country-local) from the national treasury. Treasury may go negative. */
async function debitTreasury(
  db: Db,
  countryId: string,
  amount: number,
  receiptKey: string
): Promise<void> {
  await spendFromTreasury(db, countryId, amount, {
    resyncDerived: true,
    witness: {
      flow: "crisis_response",
      key: receiptKey,
      site: "crises/interactionEngine",
    },
  });
}

/**
 * Derive the interaction roles a character holds from their seated office.
 *
 * Shared by every crisis route so the "can this character see the decision"
 * check (active-for-character) and the "can this character submit the decision"
 * check (interact) agree. Office type strings are the canonical `OfficeType`
 * discriminants from `@/lib/db/types/character`.
 */
export function deriveCharacterRoles(
  office?: { type?: string; positionId?: string } | null
): string[] {
  const roles = ["any"];
  const type = office?.type;
  // Heads of government / executive decision-makers who can resolve crises.
  // Keep this aligned with the isExecutive head-of-government keys in
  // COUNTRY_CONFIGS (president, primeMinister, chancellor, taoiseach, premier, …).
  if (
    type === "president" ||
    type === "primeMinister" ||
    type === "chancellor" ||
    type === "taoiseach" ||
    type === "premier"
  ) {
    roles.push("headOfState");
  }
  if (
    type === "usCabinet" ||
    type === "ukCabinet" ||
    type === "deCabinet" ||
    type === "parliamentaryCabinet"
  ) {
    roles.push("cabinet");
    if (office?.positionId) roles.push(`cabinet:${office.positionId}`);
  }
  if (type === "governor" || type === "ministerPresident") {
    roles.push("stateGovernor");
  }
  return roles;
}

/**
 * Like `deriveCharacterRoles` but also grants `headOfState` to executives whose
 * `currentOffice` is not a head-of-state office type:
 *
 *  - Parliamentary PMs, whose `currentOffice` is their legislative seat.
 *  - Ceremonial heads of state seated via an `electedOfficials` row rather than
 *    `currentOffice` (e.g. the CCP chair, the IE Uachtarán). Mirrors the
 *    executive route's canonical head-of-state resolution so the "who can
 *    resolve this crisis" check agrees with who the game shows as head of state.
 */
export async function resolveCharacterRoles(
  db: Db,
  character: {
    _id: ObjectId;
    currentOffice?: { type?: string; positionId?: string } | null;
    countryId?: string;
  }
): Promise<string[]> {
  const roles = deriveCharacterRoles(character.currentOffice);
  if (!roles.includes("headOfState") && character.countryId) {
    const govFormation = await getGovernmentFormationsCollection(db).findOne({
      _id: character.countryId,
      status: "formed",
    });
    if (govFormation?.pmCharacterId?.equals(character._id)) {
      roles.push("headOfState");
    }
  }
  if (!roles.includes("headOfState") && character.countryId) {
    const hosOfficeType = getHeadOfStateOfficeType(
      getCountryConfig(character.countryId as CountryId)
    );
    if (hosOfficeType) {
      const hosRow = await db.collection<ElectedOfficial>("electedOfficials").findOne({
        countryId: character.countryId as CountryId,
        officeType: hosOfficeType,
        characterId: character._id,
      });
      if (hosRow) {
        roles.push("headOfState");
      }
    }
  }
  // Parliamentary ministers can retain a legislative currentOffice.
  if (character.countryId && !roles.includes("cabinet")) {
    const cabinet = await db
      .collection<{ positionId: string }>("cabinetMembers")
      .findOne(
        { countryId: character.countryId, characterId: character._id },
        { projection: { positionId: 1 } }
      );
    if (cabinet?.positionId) roles.push("cabinet", `cabinet:${cabinet.positionId}`);
  }
  if (character.countryId) {
    const financePosition = resolveFinancePosition(character.countryId);
    if (financePosition && roles.includes(`cabinet:${financePosition}`))
      roles.push("financeMinister");
    const centralBankId = getBankId(character.countryId as CountryId);
    const chair = await centralBanksCollection(db).findOne(
      { _id: centralBankId, chairCharacterId: character._id },
      { projection: { _id: 1 } }
    );
    if (chair) roles.push("centralBankChair");
  }
  const ledParty = await db
    .collection<{ abbreviation: string }>("politicalParties")
    .findOne({ chairId: character._id }, { projection: { abbreviation: 1 } });
  if (ledParty?.abbreviation) {
    roles.push("partyLeader", `partyLeader:${ledParty.abbreviation}`);
  }
  return roles;
}

/**
 * Resolve a crisis's scope to the affected state IDs and parent countries.
 * Mirrors `resolveScope` in crisisTurn.ts but also returns the deduplicated
 * country list needed for approval effects.
 */
async function resolveCrisisScope(
  db: Db,
  crisis: Crisis
): Promise<{ targetStateIds: string[]; affectedCountries: string[] }> {
  const allStates = await statesCollection<Document>(db)
    .find({})
    .project({ _id: 1, countryId: 1 })
    .toArray();

  const statesByCountry = new Map<string, string[]>();
  const countryByState = new Map<string, string>();
  for (const state of allStates) {
    const existing = statesByCountry.get(state.countryId) ?? [];
    existing.push(state._id);
    statesByCountry.set(state.countryId, existing);
    countryByState.set(state._id, state.countryId);
  }

  if (crisis.scope === "global") {
    return {
      targetStateIds: allStates.map((s) => s._id),
      affectedCountries: [...statesByCountry.keys()],
    };
  }
  if (crisis.scope === "country") {
    return {
      targetStateIds: crisis.countryIds.flatMap((cId) => statesByCountry.get(cId) ?? []),
      affectedCountries: crisis.countryIds,
    };
  }
  // region scope: regionIds are state IDs; derive their parent countries
  const countries = new Set<string>();
  for (const stateId of crisis.regionIds) {
    const countryId = countryByState.get(stateId);
    if (countryId) countries.add(countryId);
  }
  return { targetStateIds: crisis.regionIds, affectedCountries: [...countries] };
}

/** Apply a list of effects against a crisis's resolved scope. No-op for empty lists. */
export async function applyEffectsForCrisis(
  db: Db,
  crisisId: ObjectId,
  effects: CrisisEffect[]
): Promise<void> {
  if (effects.length === 0) return;
  const crisis = await db.collection<Crisis>("crises").findOne({ _id: crisisId });
  if (!crisis) return;
  const { targetStateIds, affectedCountries } = await resolveCrisisScope(db, crisis);

  // Resolve affected characters for stat effects
  const hasStatEffects = effects.some((e) => e.targetType === "stat");
  let affectedCharacterIds: ObjectId[] | undefined;
  if (hasStatEffects) {
    affectedCharacterIds = await resolveAffectedCharacters(
      db,
      crisis,
      targetStateIds,
      affectedCountries
    );
  }

  await applyCrisisEffects(db, effects, targetStateIds, affectedCountries, affectedCharacterIds);
}

/**
 * A multi-responder node is a `choice` node on a global crisis: every affected
 * country's head of state answers for their own nation, so the interaction
 * collects one response per country instead of resolving on the first decision.
 * Country- and region-scoped crises remain single-responder (the first eligible
 * leader's choice resolves the interaction); `aid` and `collective` nodes have
 * their own multi-contributor flows and are not treated as multi-responder here.
 */
export function isMultiResponderNode(
  crisis: Pick<Crisis, "scope" | "countryIds">,
  node: CrisisDecisionNode
): boolean {
  if (node.type !== "choice") return false;
  // Authored negotiations address one government at each successive node.
  // Their crisis spans both countries, but one response advances the sequence.
  if (node.requiredCountryIds?.length === 1) return false;
  if (crisis.scope === "global") return true;
  // A country-scoped crisis addressed to MORE THAN ONE nation is also answered
  // per country: the chained Vietnam rungs put the same question to both
  // superpowers, and neither leader's choice may resolve the other's. Ordinary
  // country crises carry exactly one countryId and are untouched by this.
  return crisis.scope === "country" && (crisis.countryIds?.length ?? 0) > 1;
}

/**
 * Apply a list of effects scoped to a SINGLE country (its states + characters),
 * regardless of the crisis's broader scope. Used for per-leader responses so one
 * nation's choice only touches that nation, never the whole globe.
 */
async function applyEffectsForCountry(
  db: Db,
  countryId: string,
  effects: CrisisEffect[]
): Promise<void> {
  if (effects.length === 0) return;
  const states = await statesCollection<{ _id: string }>(db)
    .find({ countryId }, { projection: { _id: 1 } })
    .toArray();
  const targetStateIds = states.map((s) => s._id);

  let affectedCharacterIds: ObjectId[] | undefined;
  if (effects.some((e) => e.targetType === "stat")) {
    const chars = await charactersCollection<{ _id: ObjectId }>(db)
      .find({ "currentOffice.countryId": countryId, retiredAt: null }, { projection: { _id: 1 } })
      .toArray();
    affectedCharacterIds = chars.map((c) => c._id);
  }

  await applyCrisisEffects(db, effects, targetStateIds, [countryId], affectedCharacterIds);
}

/**
 * Resolve which characters are affected by a crisis for stat-loss purposes.
 * - Global: all characters
 * - Country: characters whose currentOffice country matches
 * - Region: characters whose currentOffice stateId matches a regionId
 */
async function resolveAffectedCharacters(
  db: Db,
  crisis: Crisis,
  targetStateIds: string[],
  affectedCountries: string[]
): Promise<ObjectId[]> {
  const filter: Record<string, unknown> = { retiredAt: null };

  if (crisis.scope === "global") {
    // All active characters
  } else if (crisis.scope === "country") {
    filter["currentOffice.countryId"] = { $in: affectedCountries };
  } else if (crisis.scope === "region") {
    filter["currentOffice.stateId"] = { $in: targetStateIds };
  }

  const chars = await charactersCollection<{ _id: ObjectId }>(db)
    .find(filter, { projection: { _id: 1 } })
    .toArray();

  return chars.map((c) => c._id);
}

/**
 * Finalize a terminal node: apply its outcome effects and emit the outcome wire
 * event. Called whenever an interaction reaches a `terminal` node (via a player
 * decision or an auto-resolution).
 */
async function finalizeTerminalNode(
  db: Db,
  interaction: CrisisInteraction,
  terminalNode: CrisisDecisionNode
): Promise<void> {
  if (terminalNode.outcomeEffects?.length) {
    await applyEffectsForCrisis(db, interaction.crisisId, terminalNode.outcomeEffects);
  }
  await logWireEvent("crisis_outcome", terminalNode.outcomeMessage ?? "Crisis resolved.", {
    href: `/world/crises/${interaction.crisisId.toString()}`,
  });
}

/**
 * Create a CrisisInteraction document when a crisis with interactionDefinition is activated.
 * Called by crisisTurn.ts when a crisis starts and by the admin route at creation time.
 */
export async function createCrisisInteraction(
  db: Db,
  crisis: Crisis
): Promise<CrisisInteraction | null> {
  if (!crisis.interactionDefinition) return null;

  // Guard against double-creation (admin inline + turn processor, or re-runs).
  const existing = await db
    .collection<CrisisInteraction>("crisisInteractions")
    .findOne({ crisisId: crisis._id });
  if (existing) return existing;

  // Any choice node with an `aid_contribute` option becomes an `aid` node so
  // the panel renders the slider flow and the decline path routes through
  // submitCrisisDecision. The template tree is never mutated: deep-clone first.
  const workingTree = JSON.parse(
    JSON.stringify(crisis.interactionDefinition.decisionTree)
  ) as CrisisDecisionNode[];
  for (const node of workingTree) {
    if (node.type === "choice" && node.options?.some((o) => o.optionId === "aid_contribute")) {
      // Promote to aid node
      node.type = "aid";
      node.requiredRoles = ["headOfState"];
      node.aidMaxPctGdp = AID_MAX_PCT_GDP;
      node.aidDefaultPctGdp = AID_DEFAULT_PCT_GDP;

      // Reorder options: the no-aid/skip option must be first so the panel's
      // "Decline" button and auto-resolve both default to it.
      const skipIdx = node.options!.findIndex((o) => o.optionId === "aid_skip");
      if (skipIdx > 0) {
        const [skipOption] = node.options!.splice(skipIdx, 1);
        node.options!.unshift(skipOption);
      } else if (skipIdx === -1) {
        // Fall back: move the non-aid_contribute option (first non-contribute) to front
        const fallbackIdx = node.options!.findIndex((o) => o.optionId !== "aid_contribute");
        if (fallbackIdx > 0) {
          const [fallbackOption] = node.options!.splice(fallbackIdx, 1);
          node.options!.unshift(fallbackOption);
        }
      }
    }
  }

  const now = new Date();
  const firstNode = workingTree[0];
  const deadline = firstNode?.timeLimitMinutes
    ? new Date(now.getTime() + firstNode.timeLimitMinutes * 60_000)
    : null;

  const interaction: CrisisInteraction = {
    _id: new ObjectId(),
    crisisId: crisis._id,
    decisionTree: workingTree,
    currentNodeId: firstNode?.nodeId ?? null,
    collectiveTarget: firstNode?.collectiveTarget ?? null,
    collectiveCurrent: 0,
    contributors: [],
    decisionDeadline: deadline,
    autoResolveOnExpiry: crisis.interactionDefinition.autoResolveOnExpiry,
    resolvedAt: null,
    resolutionPath: [],
    resolutionOutcome: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<CrisisInteraction>("crisisInteractions").insertOne(interaction);
  return interaction;
}

/**
 * Get the active CrisisInteraction for a crisis, or null if none exists.
 */
export async function getCrisisInteraction(
  db: Db,
  crisisId: ObjectId
): Promise<CrisisInteraction | null> {
  return db.collection<CrisisInteraction>("crisisInteractions").findOne({ crisisId });
}

/** Load interactions for a set of crises in one query, keyed by crisis id. */
export async function getCrisisInteractionsByCrisisId(
  db: Db,
  crisisIds: readonly ObjectId[]
): Promise<Map<string, CrisisInteraction>> {
  const uniqueIds = [...new Map(crisisIds.map((id) => [id.toString(), id])).values()];
  if (uniqueIds.length === 0) return new Map();
  const interactions = await db
    .collection<CrisisInteraction>("crisisInteractions")
    .find({ crisisId: { $in: uniqueIds } })
    .toArray();
  return new Map(interactions.map((interaction) => [interaction.crisisId.toString(), interaction]));
}

function deadlineForNode(node: CrisisDecisionNode | null): Date | null {
  if (node?.timeLimitMinutes) {
    return new Date(Date.now() + node.timeLimitMinutes * 60_000);
  }
  return null;
}

/**
 * Submit a decision choice for a crisis interaction.
 * Returns the updated interaction and the next node (null once resolved).
 */
/**
 * A converted crisis answers covered options, pledges and contributions through
 * its levers, never both. An aid node's decline stays on the decision.
 */
export function decisionAnsweredByLever(
  crisis: Pick<Crisis, "v2">,
  tree: readonly CrisisDecisionNode[],
  node: CrisisDecisionNode,
  optionId?: string
): boolean {
  if (!crisis.v2 || !isLegacyDefinitionId(crisis.v2.definitionId)) return false;
  if (node.type === "aid") {
    return (
      !optionId && leversFromDecisionTree(tree).some((lever) => lever.id === `pool.${node.nodeId}`)
    );
  }
  if (node.type !== "choice" && node.type !== "collective") return false;
  if (optionId) return optionAnsweredByLever(tree, node.nodeId, optionId);
  return (node.options ?? []).some((option) =>
    optionAnsweredByLever(tree, node.nodeId, option.optionId)
  );
}

/**
 * Submit a decision choice for a crisis interaction.
 * Returns the updated interaction and the next node (null once resolved).
 */
export async function submitCrisisDecision(
  db: Db,
  interactionId: ObjectId,
  optionId: string,
  characterId: ObjectId,
  countryId: string,
  characterRoles: string[] = ["any"],
  regionId?: string
): Promise<{
  interaction: CrisisInteraction;
  nextNode: CrisisDecisionNode | null;
  appliedEffects: CrisisEffect[];
}> {
  const interaction = await db
    .collection<CrisisInteraction>("crisisInteractions")
    .findOne({ _id: interactionId });

  if (!interaction) throw notFound("Crisis interaction not found");
  if (interaction.resolvedAt) throw conflict("Crisis already resolved");

  const currentNode = interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId);
  if (!currentNode) throw conflict("No active decision node");

  if (!canCharacterInteract(currentNode, characterRoles, countryId, regionId)) {
    throw forbidden("You are not authorized to make this decision");
  }

  const crisis = await db.collection<Crisis>("crises").findOne({ _id: interaction.crisisId });
  if (crisis && decisionAnsweredByLever(crisis, interaction.decisionTree, currentNode, optionId)) {
    throw conflict("This crisis is answered through its levers");
  }
  if (crisis && !canRespondToCrisis(crisis, currentNode, countryId, regionId)) {
    throw forbidden("You are not authorized to make this decision for this country or region");
  }

  const context: DecisionContext = {
    db,
    interactionId,
    interaction,
    currentNode,
    crisis,
    optionId,
    characterId,
    countryId,
  };
  if (crisis && isMultiResponderNode(crisis, currentNode)) {
    return answerMultiResponderNode({ ...context, crisis });
  }
  if (currentNode.type === "collective") return answerCollectiveNode(context);
  return answerChoiceNode(context);
}

export interface DecisionContext {
  db: Db;
  interactionId: ObjectId;
  interaction: CrisisInteraction;
  currentNode: CrisisDecisionNode;
  crisis: Crisis | null;
  optionId: string;
  characterId: ObjectId;
  countryId: string;
  /** The option's budget was already charged by the caller (a lever pull). */
  budgetPaid?: boolean;
}

export interface DecisionResult {
  interaction: CrisisInteraction;
  nextNode: CrisisDecisionNode | null;
  appliedEffects: CrisisEffect[];
}

/**
 * Per-country answer to a multi-responder node: claims the country's one
 * response before any money or effect moves, then applies the option scoped to
 * that country and runs its action hook.
 */
export async function answerMultiResponderNode(
  context: DecisionContext & { crisis: Crisis }
): Promise<DecisionResult> {
  const { db, interactionId, interaction, currentNode, crisis, optionId, characterId, countryId } =
    context;
  const budgetPaid = context.budgetPaid === true;
  // A country with no role sees an empty option list, which would otherwise
  // surface as "Invalid option" — the option is fine, the nation simply is
  // not party to this response. Say so instead.
  if (crisis.globalResponse && !globalResponseRoleFor(crisis, countryId)) {
    throw forbidden("Your country is not one of the governments called to respond");
  }
  const responseOptions = crisis.globalResponse
    ? optionsForGlobalResponder(crisis, currentNode, countryId)
    : (currentNode.options ?? []);
  const option = responseOptions.find((o) => o.optionId === optionId);
  if (!option) throw badRequest("Invalid option");

  const already = (interaction.leaderResponses ?? []).some((r) => r.countryId === countryId);
  if (already) throw conflict("Your country has already responded to this crisis");
  const preparedGlobalResponse = crisis.globalResponse
    ? await prepareGlobalResponseOption(db, crisis, countryId, option)
    : undefined;
  const capabilitySnapshot = preparedGlobalResponse?.capability;
  const refugeeReceptionOrder = await prepareRefugeeReceptionOrder(
    db,
    crisis,
    interaction,
    countryId,
    option,
    currentNode.nodeId
  );

  if (option.requiredBudget && !budgetPaid) {
    const treasury = await getTreasuryBalance(db, countryId);
    if (treasury < option.requiredBudget) {
      throw badRequest(
        `Insufficient funds. Required: ${option.requiredBudget}, Available: ${treasury}`
      );
    }
  }

  const character = await charactersCollection<{ name?: string }>(db).findOne(
    { _id: characterId },
    { projection: { name: 1 } }
  );

  const response = {
    countryId,
    characterId,
    characterName: character?.name ?? "Unknown leader",
    nodeId: currentNode.nodeId,
    optionId,
    optionLabel: option.label,
    responseRole: globalResponseRoleFor(crisis, countryId) ?? undefined,
    effects: option.effects,
    responseScores: option.responseScores,
    capabilitySnapshot,
    campaignCommitment: option.campaignCommitment,
    visibility: option.responseVisibility ?? "public",
    respondedAt: new Date(),
    ...(refugeeReceptionOrder ? { refugeeReceptionOrder } : {}),
  };
  interaction.updatedAt = new Date();

  // Claim the country's one response before any money or effects move. The
  // guarded write makes a double-click or concurrent request idempotent.
  const claimed = await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
    {
      _id: interactionId,
      resolvedAt: null,
      "leaderResponses.countryId": { $ne: countryId },
    },
    {
      $push: { leaderResponses: response },
      $set: {
        updatedAt: interaction.updatedAt,
        ...(refugeeReceptionOrder
          ? {
              populationOrderEpochId: refugeeReceptionOrder.worldEpochId,
              populationOrdersPending: true,
            }
          : {}),
      },
    }
  );
  if (claimed.modifiedCount === 0) {
    throw conflict("Your country has already responded to this crisis");
  }
  interaction.leaderResponses = [...(interaction.leaderResponses ?? []), response];

  if (option.requiredBudget && !budgetPaid) {
    await debitTreasury(
      db,
      countryId,
      option.requiredBudget,
      `crisis-budget:${interactionId.toString()}:${countryId}:${optionId}`
    );
  }
  await spendGlobalResponseCost(
    db,
    countryId,
    option,
    `global-response:${interactionId.toString()}:${countryId}:${optionId}`
  );

  if (option.effects.length > 0) {
    await applyEffectsForCountry(db, countryId, option.effects);
  }

  // Multi-responder options get the same real-subsystem action hook as
  // single-responder ones. Without this a per-country choice could only ever
  // nudge metrics, which is precisely the cosmetic-crisis problem the hook
  // exists to solve.
  const gameState = option.action || option.campaignCommitment ? await getGameState(db) : null;
  if (option.action) {
    await runCrisisOptionAction({
      db,
      crisis,
      interaction,
      option,
      characterId,
      countryId,
      currentTurn: gameState?.currentTurn ?? crisis.startTurn,
      treasuryCashLedgerEnabled: preparedGlobalResponse?.treasuryCashLedgerEnabled,
    });
  }
  if (option.campaignCommitment) {
    await recordGlobalResponseCommitment(
      db,
      crisis,
      countryId,
      gameState?.currentTurn ?? crisis.startTurn,
      option
    );
  }

  return { interaction, nextNode: currentNode, appliedEffects: option.effects };
}

/** Contribution to a collective node: claims the slot, spends, and rolls back if the spend fails. */
export async function answerCollectiveNode(context: DecisionContext): Promise<DecisionResult> {
  const { db, interactionId, interaction, currentNode, optionId, characterId, countryId } = context;
  const option = currentNode.options?.find((o) => o.optionId === optionId);
  if (!option) throw badRequest("Invalid option");

  const interactions = db.collection<CrisisInteraction>("crisisInteractions");
  const contribution = option.collectiveContribution ?? 0;
  const now = new Date();
  const entry = {
    countryId,
    amount: contribution,
    characterId,
    contributedAt: now,
  };

  if (contribution > 0) {
    const already = interaction.contributors.some(
      (c) => c.characterId.toString() === characterId.toString()
    );
    if (already) throw conflict("You have already contributed to this crisis");

    const treasury = await getTreasuryBalance(db, countryId);
    if (treasury < contribution) {
      throw badRequest(
        `Insufficient treasury funds. Required: ${contribution}, Available: ${treasury}`
      );
    }

    // Claim the contribution slot before any money moves; $push/$inc keep
    // concurrent contributions from different countries from overwriting
    // each other.
    const claimed = await interactions.updateOne(
      {
        _id: interactionId,
        resolvedAt: null,
        currentNodeId: currentNode.nodeId,
        "contributors.characterId": { $ne: characterId },
      },
      {
        $push: { contributors: entry },
        $inc: { collectiveCurrent: contribution },
        $set: { updatedAt: now },
      }
    );
    if (claimed.matchedCount === 0) {
      throw conflict("You have already contributed to this crisis");
    }
    try {
      await spendFromTreasury(db, countryId, contribution, {
        resyncDerived: true,
        witness: {
          flow: "crisis_response",
          key: `crisis-collective:${interaction._id.toString()}:${characterId.toString()}:${optionId}`,
          site: "crises/interactionEngine",
        },
      });
    } catch (err) {
      await interactions.updateOne({ _id: interactionId }, {
        $pull: { contributors: { characterId, contributedAt: now } },
        $inc: { collectiveCurrent: -contribution },
        $set: { updatedAt: new Date() },
      } as unknown as UpdateFilter<CrisisInteraction>);
      throw err;
    }

    interaction.contributors.push(entry);
    interaction.collectiveCurrent += contribution;
  }
  await interactions.updateOne(
    { _id: interactionId },
    { $push: { resolutionPath: optionId }, $set: { updatedAt: now } }
  );

  if (option.effects.length > 0) {
    await applyEffectsForCrisis(db, interaction.crisisId, option.effects);
  }

  interaction.resolutionPath.push(optionId);
  interaction.updatedAt = now;

  return { interaction, nextNode: currentNode, appliedEffects: option.effects };
}

/** Single-responder choice or aid decline: claim, charge, effects, action hook, advance the node. */
export async function answerChoiceNode(context: DecisionContext): Promise<DecisionResult> {
  const { db, interactionId, interaction, currentNode, crisis, optionId, characterId, countryId } =
    context;
  const budgetPaid = context.budgetPaid === true;
  let appliedEffects: CrisisEffect[] = [];
  let nextNodeId: string | null = null;

  if (currentNode.type === "choice" || currentNode.type === "aid") {
    const option = currentNode.options?.find((o) => o.optionId === optionId);
    if (!option) throw badRequest("Invalid option");

    // Every check runs before any money moves: a rejected choice must not cost
    // the treasury its budget.
    if (option.requiredApproval) {
      const approvalDoc = await db
        .collection("governmentApprovals")
        .findOne({ _id: countryId as unknown as import("mongodb").ObjectId });
      const approval = (approvalDoc?.approvalRating as number | undefined) ?? 0;
      if (approval < option.requiredApproval) {
        throw badRequest(
          `Insufficient approval. Required: ${option.requiredApproval}, Current: ${approval}`
        );
      }
    }

    if (option.requiredBudget && !budgetPaid) {
      const treasury = await getTreasuryBalance(db, countryId);
      if (treasury < option.requiredBudget) {
        throw badRequest(
          `Insufficient funds. Required: ${option.requiredBudget}, Available: ${treasury}`
        );
      }
    }

    // Claim the decision on the version this request read, before any money
    // or effect moves, so a double click cannot apply the choice twice.
    const claimedAt = new Date();
    const claimed = await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
      {
        _id: interactionId,
        resolvedAt: null,
        currentNodeId: currentNode.nodeId,
        updatedAt: interaction.updatedAt,
      },
      { $set: { updatedAt: claimedAt } }
    );
    if (claimed.matchedCount === 0) {
      throw conflict("This crisis decision was already made");
    }
    interaction.updatedAt = claimedAt;

    if (option.requiredBudget && !budgetPaid) {
      await debitTreasury(
        db,
        countryId,
        option.requiredBudget,
        `crisis-budget:${interactionId.toString()}:${countryId}:${optionId}`
      );
    }

    appliedEffects = option.effects;
    nextNodeId = option.nextNodeId;
    interaction.resolutionPath.push(optionId);
  } else {
    throw badRequest("Current node does not accept choices");
  }

  if (appliedEffects.length > 0) {
    await applyEffectsForCrisis(db, interaction.crisisId, appliedEffects);
  }

  // ── Real-subsystem action hook. Runs after flat effects, before navigation,
  //    so a choice can file a bill / issue a taking / spawn a court case in
  //    addition to nudging metrics. Best-effort (see runCrisisOptionAction). ──
  //    A handler may also redirect the navigation (see `CrisisActionResult`):
  //    a retryable action decides for itself whether the attempt succeeded,
  //    which one static `nextNodeId` on the option cannot express.
  let actionResult: CrisisActionResult = {};
  const chosenOption = currentNode.options?.find((o) => o.optionId === optionId);
  if (crisis && chosenOption?.action) {
    const gameState = await getGameState(db);
    actionResult = await runCrisisOptionAction({
      db,
      crisis,
      interaction,
      option: chosenOption,
      characterId,
      countryId,
      currentTurn: gameState?.currentTurn ?? crisis.startTurn,
    });
  }

  // ── Navigate. Landing on a terminal node applies its outcome and resolves. ──
  //    An action hook that returned its own `nextNodeId` wins: the option's
  //    static target is the "the attempt did not change anything" case, and the
  //    handler names the node when it did.
  const resolvedNextNodeId = actionResult.nextNodeId ?? nextNodeId;
  const nextNode = resolvedNextNodeId
    ? (interaction.decisionTree.find((n) => n.nodeId === resolvedNextNodeId) ?? null)
    : null;

  if (nextNode && nextNode.type !== "terminal") {
    interaction.currentNodeId = nextNode.nodeId;
    interaction.decisionDeadline = deadlineForNode(nextNode);
    // Collective targets live on the collective node, which may not be the
    // tree's first node, so capture it as the interaction enters that node.
    if (nextNode.type === "collective") {
      interaction.collectiveTarget = nextNode.collectiveTarget ?? null;
    }
  } else {
    if (nextNode) {
      await finalizeTerminalNode(db, interaction, nextNode);
      interaction.resolutionPath.push(nextNode.nodeId);
    }
    interaction.currentNodeId = null;
    interaction.decisionDeadline = null;
    interaction.resolvedAt = new Date();
    interaction.resolutionOutcome = "success";
  }

  interaction.updatedAt = new Date();

  await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
    { _id: interactionId },
    {
      $set: {
        currentNodeId: interaction.currentNodeId,
        collectiveTarget: interaction.collectiveTarget,
        decisionDeadline: interaction.decisionDeadline,
        resolvedAt: interaction.resolvedAt,
        resolutionPath: interaction.resolutionPath,
        resolutionOutcome: interaction.resolutionOutcome,
        updatedAt: interaction.updatedAt,
      },
    }
  );

  return { interaction, nextNode: interaction.resolvedAt ? null : nextNode, appliedEffects };
}

/**
 * Auto-resolve a crisis interaction when the deadline expires.
 * Picks the default option ("decline" if available, otherwise the first) and
 * advances along its path, finalizing any terminal node it reaches.
 */
export async function autoResolveCrisisInteraction(db: Db, interactionId: ObjectId): Promise<void> {
  const interaction = await db
    .collection<CrisisInteraction>("crisisInteractions")
    .findOne({ _id: interactionId });

  if (!interaction || interaction.resolvedAt) return;

  const currentNode = interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId);
  if (!currentNode) {
    // A node id the tree no longer has can never be answered; close it rather
    // than re-select it every turn.
    await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
      { _id: interactionId, resolvedAt: null },
      {
        $set: {
          currentNodeId: null,
          decisionDeadline: null,
          resolvedAt: new Date(),
          resolutionOutcome: "auto",
          updatedAt: new Date(),
        },
      }
    );
    return;
  }

  // Multi-responder (global) nodes self-serve per country: each leader already
  // applied their own effects, and non-responders simply took no action. Closing
  // the interaction must NOT apply a global default — that would re-hit every
  // country, including those that already chose. Just mark it resolved.
  const crisis = await db.collection<Crisis>("crises").findOne({ _id: interaction.crisisId });
  if (crisis && isMultiResponderNode(crisis, currentNode)) {
    if (crisis.globalResponse) {
      await resolveGlobalResponse(db, crisis._id);
      return;
    }
    await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
      { _id: interactionId },
      {
        $set: {
          currentNodeId: null,
          decisionDeadline: null,
          resolvedAt: new Date(),
          resolutionOutcome: "completed",
          updatedAt: new Date(),
        },
      }
    );
    return;
  }

  const defaultOption =
    currentNode.options?.find((o) => o.optionId === "decline") ?? currentNode.options?.[0];

  const resolutionPath = [...interaction.resolutionPath];

  if (defaultOption?.action?.kind === "livingConflictTrajectory") {
    await applyLivingConflictFallback(
      db,
      `${interactionId}:${currentNode.nodeId}`,
      defaultOption.action
    );
  }

  if (defaultOption?.effects.length) {
    await applyEffectsForCrisis(db, interaction.crisisId, defaultOption.effects);
  }
  if (defaultOption) {
    resolutionPath.push(defaultOption.optionId);
  }

  const nextNodeId = defaultOption?.nextNodeId ?? null;
  const nextNode = nextNodeId
    ? (interaction.decisionTree.find((n) => n.nodeId === nextNodeId) ?? null)
    : null;

  // Advance to a non-terminal successor; otherwise finalize and resolve as auto.
  if (nextNode && nextNode.type !== "terminal") {
    await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
      { _id: interactionId },
      {
        $set: {
          currentNodeId: nextNode.nodeId,
          decisionDeadline: deadlineForNode(nextNode),
          resolutionPath,
          updatedAt: new Date(),
        },
      }
    );
    return;
  }

  if (nextNode) {
    await finalizeTerminalNode(db, interaction, nextNode);
    resolutionPath.push(nextNode.nodeId);
  }

  await db.collection<CrisisInteraction>("crisisInteractions").updateOne(
    { _id: interactionId },
    {
      $set: {
        currentNodeId: null,
        decisionDeadline: null,
        resolvedAt: new Date(),
        resolutionOutcome: "auto",
        resolutionPath,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Calculate crisis duration reduction based on collective contributions.
 * Returns the number of turns to reduce.
 */
export function calculateCollectiveReduction(
  interaction: CrisisInteraction,
  baseDuration: number
): number {
  // Full funding = 50% duration reduction
  return collectiveDurationReduction(
    interaction.collectiveCurrent,
    interaction.collectiveTarget,
    baseDuration
  );
}

/**
 * Turns cut from a crisis by the options its leaders actually chose.
 *
 * `resolutionPath` holds every option and node id traversed; node ids never
 * collide with option ids, so matched options are exactly the chosen ones.
 * Counted per option id so a role-specific menu and its `options` fallback
 * declaring the same option cannot double-charge.
 *
 * Distinct from `calculateCollectiveReduction` (funding of a shared aid
 * tally); a crisis carrying both gets both. Global multi-responder crises
 * record into `leaderResponses` and never touch `resolutionPath`, so they
 * earn nothing here; the `optionsByRole` scan is defensive for mixed trees.
 *
 * Reads the interaction's own tree snapshot, not the live template, so new
 * authored reductions do not retroactively shorten running crises.
 */
export function calculateDecisionDurationReduction(
  interaction: Pick<CrisisInteraction, "decisionTree" | "resolutionPath">
): number {
  const chosen = new Set(interaction.resolutionPath ?? []);
  if (chosen.size === 0) return 0;

  // Counted per option id, not per authored entry: a role-specific menu and the
  // plain `options` fallback may both declare the same option, and choosing it
  // once must not be charged twice.
  const counted = new Map<string, number>();
  for (const node of interaction.decisionTree ?? []) {
    const menus = [node.options ?? [], ...Object.values(node.optionsByRole ?? {})];
    for (const menu of menus) {
      for (const option of menu ?? []) {
        if (!chosen.has(option.optionId) || counted.has(option.optionId)) continue;
        const reduction = option.durationReductionTurns;
        if (typeof reduction === "number" && Number.isFinite(reduction) && reduction > 0) {
          counted.set(option.optionId, reduction);
        }
      }
    }
  }
  let total = 0;
  for (const reduction of counted.values()) total += reduction;
  return total;
}

/**
 * Get all active crisis interactions that need auto-resolution.
 * Called by the cron/turn processor.
 */
export async function getExpiredInteractions(db: Db): Promise<CrisisInteraction[]> {
  return db
    .collection<CrisisInteraction>("crisisInteractions")
    .find({
      resolvedAt: null,
      decisionDeadline: { $lt: new Date() },
      autoResolveOnExpiry: true,
    })
    .toArray();
}
