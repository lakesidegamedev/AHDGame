import { crisisDecisionRegion, canRespondToCrisis } from "@/lib/crises/rules/authorization";
import { conditionalJson } from "@/lib/api/conditionalJson";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import {
  getCrisisInteraction,
  canCharacterInteract,
  resolveCharacterRoles,
  isMultiResponderNode,
  decisionAnsweredByLever,
} from "@/lib/crises/interactionEngine";
import type { Crisis, CrisisInteraction } from "@/lib/db/types/crisis";
import { ObjectId } from "mongodb";
import {
  campaignBriefForGlobalResponder,
  globalResponseRoleFor,
  optionsForGlobalResponder,
  visibleGlobalResponses,
} from "@/lib/livingConflict/globalResponse";
import { getGameState } from "@/lib/gameState";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

/**
 * GET /api/crises/[id]/interaction
 * Returns the crisis detail + the current character's interaction state.
 * Auth: requireAuthWithCharacter
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const character = user.character;

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return errorResponse(400, "Invalid crisis ID");
    }

    const db = await getDb();
    const crisis = await db.collection<Crisis>("crises").findOne({ _id: new ObjectId(id) });
    if (!crisis) {
      return errorResponse(404, "Crisis not found");
    }

    const characterRoles = await resolveCharacterRoles(db, character);

    let interaction: CrisisInteraction | null = null;
    if (crisis.interactionDefinition) {
      interaction = await getCrisisInteraction(db, new ObjectId(id));
    }

    const visibleDecisionTree = crisis.interactionDefinition?.decisionTree;

    const activeNode = interaction
      ? (interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId) ??
        interaction.decisionTree[0])
      : null;

    // Multi-responder (global choice) crises: each country's leader answers once
    // for their own nation. A leader whose country already responded can no longer
    // interact, even though the interaction stays open for the rest.
    const multiResponder =
      !!interaction && !!activeNode && isMultiResponderNode(crisis, activeNode);
    const alreadyResponded =
      multiResponder && !!character.countryId
        ? (interaction!.leaderResponses ?? []).some((r) => r.countryId === character.countryId)
        : false;

    const canInteract =
      crisis.interactionDefinition && interaction && activeNode && !interaction.resolvedAt
        ? canCharacterInteract(
            activeNode,
            characterRoles,
            character.countryId,
            crisisDecisionRegion(character)
          ) &&
          canRespondToCrisis(
            crisis,
            activeNode,
            character.countryId,
            crisisDecisionRegion(character)
          ) &&
          !alreadyResponded &&
          !decisionAnsweredByLever(crisis, interaction.decisionTree, activeNode) &&
          (!crisis.globalResponse || !!globalResponseRoleFor(crisis, character.countryId))
        : false;

    const responseRole = character.countryId
      ? globalResponseRoleFor(crisis, character.countryId)
      : null;
    const serializedTree = interaction?.decisionTree.map((node) =>
      node.nodeId === interaction.currentNodeId && crisis.globalResponse && character.countryId
        ? { ...node, options: optionsForGlobalResponder(crisis, node, character.countryId) }
        : node
    );
    const campaignBrief =
      interaction && activeNode && crisis.globalResponse && character.countryId
        ? await campaignBriefForGlobalResponder(
            db,
            crisis,
            character.countryId,
            (await getGameState(db))?.currentTurn ?? crisis.startTurn,
            optionsForGlobalResponder(crisis, activeNode, character.countryId)
          )
        : null;
    const visibleLeaderResponses = character.countryId
      ? visibleGlobalResponses(interaction?.leaderResponses ?? [], character.countryId)
      : [];

    // Aid context: expose sender fiscal fields for the slider UI when the current
    // node is an aid node and the aid-bills feature flag is on.
    let aidContext: {
      senderGdp: number;
      senderTreasuryBalance: number;
      senderCurrencyCode: string;
      alreadyPledged: boolean;
    } | null = null;

    const currentNode = interaction?.decisionTree.find(
      (n) => n.nodeId === interaction.currentNodeId
    );
    if (currentNode?.type === "aid" && character.countryId) {
      const budget = await federalBudgetCollection(db).findOne({ countryId: character.countryId });
      const senderGdp =
        budget?.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : (budget?.gdp ?? 0);
      const pledged = await db
        .collection("crisisAidCommitments")
        .findOne({ crisisId: new ObjectId(id), senderCountryId: character.countryId });
      aidContext = {
        senderGdp,
        senderTreasuryBalance: budget?.treasuryBalance ?? 0,
        senderCurrencyCode: budget?.currencyCode ?? "USD",
        alreadyPledged: !!pledged,
      };
    }

    // Per-character interaction state — private ETag/304 only, never shared.
    return conditionalJson(request, {
      crisis: {
        ...crisis,
        _id: crisis._id.toString(),
      },
      interaction: interaction
        ? {
            ...interaction,
            decisionTree: serializedTree,
            _id: interaction._id.toString(),
            crisisId: interaction.crisisId.toString(),
            leaderResponses: visibleLeaderResponses.map((r) => ({
              ...r,
              characterId: r.characterId.toString(),
            })),
          }
        : null,
      canInteract,
      multiResponder,
      alreadyResponded,
      characterRoles,
      responseRole,
      campaignBrief,
      visibleDecisionTree,
      aidContext,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
