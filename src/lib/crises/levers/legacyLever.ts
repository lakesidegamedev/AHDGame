import type { ObjectId, Db } from "mongodb";
import { ApiError } from "@/lib/api/errors";
import type { CountryId } from "@/lib/constants/countries";
import { AID_DEFAULT_PCT_GDP } from "@/lib/constants/crises";
import { submitCrisisAidPledge } from "@/lib/crises/aidPledge";
import {
  answerChoiceNode,
  answerCollectiveNode,
  answerMultiResponderNode,
  isMultiResponderNode,
  resolveCharacterRoles,
  type DecisionContext,
} from "@/lib/crises/interactionEngine";
import {
  canCharacterInteract,
  canRespondToCrisis,
  crisisDecisionRegion,
} from "@/lib/crises/rules/authorization";
import type { LegacyLeverRef } from "@/lib/crises/v2/types";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import type { Character } from "@/lib/db/types";
import type { Crisis, CrisisInteraction } from "@/lib/db/types/crisis";
import { logger } from "@/lib/observability/logger";
import {
  checkLeverEligibility,
  commitLeverUse,
  fail,
  pullLever,
  type LeverResult,
  type LeverUseSummary,
  type PullLeverInput,
} from "./leverCommand";

const COMPONENT = "crisisLegacyLever";

export interface PullLegacyLeverInput extends PullLeverInput {
  /** Aid pledge size as a share of the sender's GDP. Ignored by other levers. */
  pctGdp?: number;
}

function rejected(error: unknown): LeverResult<never> | null {
  if (!(error instanceof ApiError)) return null;
  return { ok: false, code: "rejected", status: error.status, message: error.message };
}

/**
 * Pulls a lever. Levers that stand in for an authored decision run that
 * decision's own code (option effects and action hook, aid pledge, collective
 * contribution) once the pull is claimed and charged; if that code refuses, the
 * pull is refunded and freed so nothing is left half done.
 */
export async function pullLeverWithDecision(
  db: Db,
  input: PullLegacyLeverInput
): Promise<LeverResult<LeverUseSummary>> {
  const eligible = await checkLeverEligibility(db, input);
  if (!eligible.ok) return eligible;
  const { crisis: live, lever, actor, turn } = eligible.context;
  const ref = lever.legacy;
  if (!ref) return pullLever(db, input);

  const [crisis, interaction, character] = await Promise.all([
    db.collection<Crisis>("crises").findOne({ _id: input.crisisId }),
    db.collection<CrisisInteraction>("crisisInteractions").findOne({ crisisId: input.crisisId }),
    getCharactersCollection(db).then((characters) =>
      characters.findOne({ _id: input.characterId })
    ),
  ]);
  if (!crisis || !interaction || !character || !actor.countryId) {
    return fail("not_found", "This response is no longer open");
  }
  if (interaction.resolvedAt || interaction.currentNodeId !== ref.nodeId) {
    return fail("rejected", "This decision has already been made");
  }
  const node = interaction.decisionTree.find((candidate) => candidate.nodeId === ref.nodeId);
  if (!node) return fail("not_found", "This response is no longer open");

  const roles = await resolveCharacterRoles(db, character);
  const regionId = crisisDecisionRegion(character);
  if (!canCharacterInteract(node, roles, actor.countryId, regionId)) {
    return fail("wrong_role", "You are not authorized to make this decision");
  }
  if (!canRespondToCrisis(crisis, node, actor.countryId, regionId)) {
    return fail("out_of_jurisdiction", "This decision is not yours to make");
  }

  const option = ref.optionId ? node.options?.find((o) => o.optionId === ref.optionId) : undefined;
  if (ref.kind !== "aid" && !option) return fail("not_found", "No such option on this decision");
  if (option?.requiredApproval) {
    const approval = await db
      .collection<{ approvalRating?: number }>("governmentApprovals")
      .findOne({ _id: actor.countryId as unknown as ObjectId });
    if ((approval?.approvalRating ?? 0) < option.requiredApproval) {
      return fail("rejected", `Insufficient approval. Required: ${option.requiredApproval}`);
    }
  }

  const committed = await commitLeverUse(db, {
    crisis: live,
    lever,
    holderId: actor._id,
    countryId: actor.countryId,
    intensity: 1,
    turn,
  });
  if (!committed.ok) return committed;

  try {
    await runDecision(db, ref, {
      crisis,
      interaction,
      node,
      input,
      character,
      countryId: actor.countryId,
      roles,
    });
  } catch (error) {
    await committed.undo();
    const refusal = rejected(error);
    if (refusal) return refusal;
    logger.error(COMPONENT, "lever decision failed; pull refunded", error, {
      crisisId: input.crisisId.toString(),
      leverId: lever.id,
    });
    throw error;
  }
  return committed;
}

interface DecisionRun {
  crisis: Crisis;
  interaction: CrisisInteraction;
  node: CrisisInteraction["decisionTree"][number];
  input: PullLegacyLeverInput;
  character: Character;
  countryId: string;
  roles: string[];
}

async function runDecision(db: Db, ref: LegacyLeverRef, run: DecisionRun): Promise<void> {
  const { crisis, interaction, node, input, character, countryId, roles } = run;
  if (ref.kind === "aid") {
    await submitCrisisAidPledge(db, {
      interactionId: interaction._id,
      nodeId: node.nodeId,
      pctGdp: input.pctGdp ?? AID_DEFAULT_PCT_GDP,
      characterId: character._id,
      characterName: character.name,
      senderCountryId: countryId as CountryId,
      characterParty: character.party ?? undefined,
      characterRoles: roles,
    });
    return;
  }
  const context: DecisionContext = {
    db,
    interactionId: interaction._id,
    interaction,
    currentNode: node,
    crisis,
    optionId: ref.optionId as string,
    characterId: character._id,
    countryId,
    budgetPaid: true,
  };
  if (ref.kind === "collective") {
    await answerCollectiveNode(context);
  } else if (isMultiResponderNode(crisis, node)) {
    await answerMultiResponderNode({ ...context, crisis });
  } else {
    await answerChoiceNode(context);
  }
}
