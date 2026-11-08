import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { ObjectId, type Db } from "mongodb";
import { creditTreasury, spendFromTreasury } from "@/lib/budget/treasurySpend";
import type { CountryId } from "@/lib/constants/countries";
import { scaleCost } from "@/lib/crises/v2/accountability";
import { leverActionCost } from "@/lib/crises/v2/leverActions";
import {
  clamp,
  type CrisisDefinition,
  type CrisisLeverDef,
  type LeverCost,
} from "@/lib/crises/v2/types";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import type { Crisis, CrisisLeverUse } from "@/lib/db/types/crisis";
import {
  atomicallyDebitCorpLiquidCapital,
  refundCorpLiquidCapital,
} from "@/lib/financialTxLog/atomicCashGuard";
import { getGameState } from "@/lib/gameState";
import { logger } from "@/lib/observability/logger";
import { resolveCrisisDefinition } from "@/lib/turn/crisisV2/ensureContent";
import { leverBlock } from "./availability";
import { crisisCountryIds, governsAffectedState, leverInActorJurisdiction } from "./jurisdiction";
import { resolveLeverRoles, type LeverActor } from "./roles";

const COMPONENT = "crisisLeverCommand";

export type LeverErrorCode =
  | "not_found"
  | "resolved"
  | "wrong_stage"
  | "wrong_role"
  | "out_of_jurisdiction"
  | "cooldown"
  | "duplicate"
  | "needs_bill"
  | "needs_corporation"
  | "insufficient_funds"
  | "insufficient_actions"
  | "needs_emergency"
  | "rejected"
  | "charge_failed";

const STATUS: Record<LeverErrorCode, number> = {
  not_found: 404,
  resolved: 409,
  wrong_stage: 409,
  wrong_role: 403,
  out_of_jurisdiction: 403,
  cooldown: 409,
  duplicate: 409,
  needs_bill: 400,
  needs_corporation: 400,
  insufficient_funds: 409,
  insufficient_actions: 409,
  needs_emergency: 409,
  rejected: 409,
  charge_failed: 500,
};

export type LeverResult<T> =
  ({ ok: true } & T) | { ok: false; code: LeverErrorCode; status: number; message: string };

export function fail(
  code: LeverErrorCode,
  message: string
): { ok: false; code: LeverErrorCode; status: number; message: string } {
  return { ok: false, code, status: STATUS[code], message };
}

export interface PullLeverInput {
  crisisId: ObjectId;
  leverId: string;
  characterId: ObjectId;
  /** Share of full effect and cost, 0..1. Defaults to 1. */
  intensity?: number;
  /** Corporation paying a corporate lever; must be run by the character. */
  corporationId?: ObjectId;
}

export interface LeverUseSummary {
  useId: ObjectId;
  cost: LeverCost;
  /** Action points taken from the holder's per-turn budget. */
  actionsSpent: number;
  /** Refunds the charge and frees the slot, for a pull whose follow-up work lost its claim. */
  undo: () => Promise<void>;
}

type LiveCrisis = Pick<Crisis, "_id" | "scope" | "countryIds" | "regionIds"> &
  Required<Pick<Crisis, "v2">>;

export function loadLiveCrisis(db: Db, crisisId: ObjectId): Promise<LiveCrisis | null> {
  return db
    .collection<Crisis>("crises")
    .findOne(
      { _id: crisisId, status: "active", "v2.definitionId": { $exists: true } },
      { projection: { scope: 1, countryIds: 1, regionIds: 1, v2: 1 } }
    ) as Promise<LiveCrisis | null>;
}

export function loadLiveCrises(db: Db, crisisIds: ObjectId[]): Promise<LiveCrisis[]> {
  return db
    .collection<Crisis>("crises")
    .find(
      { _id: { $in: crisisIds }, status: "active", "v2.definitionId": { $exists: true } },
      { projection: { scope: 1, countryIds: 1, regionIds: 1, v2: 1 } }
    )
    .toArray() as unknown as Promise<LiveCrisis[]>;
}

/** Latest turn the holder pulled this lever, counted by the turn phase or not. */
export async function lastPulledTurn(
  db: Db,
  crisisId: ObjectId,
  leverId: string,
  holderId: string
): Promise<number | undefined> {
  const row = await db
    .collection<CrisisLeverUse>("crisisLeverUses")
    .find({ crisisId, leverId, holderId }, { projection: { submittedTurn: 1 } })
    .sort({ submittedTurn: -1 })
    .limit(1)
    .toArray();
  return row[0]?.submittedTurn;
}

interface Charge {
  undo: () => Promise<void>;
}

async function chargeCost(
  db: Db,
  args: {
    cost: LeverCost;
    countryId: string | undefined;
    corporationId: ObjectId | undefined;
    receiptKey: string;
    /** The holder's own action budget pays for the political weight of the move. */
    actions?: { characterId: ObjectId; count: number };
  }
): Promise<LeverResult<{ applied: Charge[] }>> {
  const applied: Charge[] = [];
  const { cost, countryId, corporationId, receiptKey, actions } = args;
  const unwind = async () => {
    for (const charge of applied.reverse()) {
      try {
        await charge.undo();
      } catch (error) {
        logger.error(COMPONENT, "lever refund failed", error, { receiptKey });
      }
    }
  };

  if (actions && actions.count > 0) {
    const characters = await getCharactersCollection(db);
    const spent = await characters.updateOne(
      { _id: actions.characterId, actions: { $gte: actions.count } },
      { $inc: { actions: -actions.count } }
    );
    if (spent.modifiedCount === 0) {
      return fail(
        "insufficient_actions",
        `This response takes ${actions.count} of your actions this turn`
      );
    }
    applied.push({
      undo: async () => {
        await characters.updateOne(
          { _id: actions.characterId },
          { $inc: { actions: actions.count } }
        );
      },
    });
  }

  if (cost.treasuryCash && cost.treasuryCash > 0) {
    if (!countryId) {
      await unwind();
      return fail("charge_failed", "No treasury to charge");
    }
    try {
      await spendFromTreasury(db, countryId as CountryId, cost.treasuryCash, {
        resyncDerived: true,
        witness: {
          flow: "crisis_response",
          key: receiptKey,
          site: "crises/levers/leverCommand",
        },
      });
    } catch (error) {
      await unwind();
      logger.error(COMPONENT, "treasury charge failed", error, { receiptKey });
      return fail("insufficient_funds", "The treasury cannot cover this response");
    }
    const amount = cost.treasuryCash;
    applied.push({
      undo: async () => {
        await creditTreasury(db, countryId as CountryId, amount, {
          resyncDerived: true,
          witness: { flow: "crisis_response", site: "crises/levers/leverCommand" },
        });
      },
    });
  }

  if (cost.corpCash && cost.corpCash > 0) {
    if (!corporationId) {
      await unwind();
      return fail("needs_corporation", "Pick the corporation that pays for this response");
    }
    const debit = await atomicallyDebitCorpLiquidCapital(db, corporationId, cost.corpCash);
    if (!debit.ok) {
      await unwind();
      return fail("insufficient_funds", debit.error);
    }
    const amount = cost.corpCash;
    applied.push({
      undo: async () => void (await refundCorpLiquidCapital(db, corporationId, amount)),
    });
  }

  if (cost.approval && cost.approval.points !== 0) {
    if (!countryId) {
      await unwind();
      return fail("charge_failed", "No government to charge approval to");
    }
    const points = cost.approval.points;
    const approvals = db.collection<GovernmentApproval>("governmentApprovals");
    await approvals.updateOne(
      { _id: countryId as CountryId },
      { $inc: { approvalRating: -points } }
    );
    applied.push({
      undo: async () => {
        await approvals.updateOne(
          { _id: countryId as CountryId },
          { $inc: { approvalRating: points } }
        );
      },
    });
  }

  return { ok: true, applied };
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

export interface CommitLeverArgs {
  crisis: LiveCrisis;
  lever: CrisisLeverDef;
  holderId: ObjectId;
  /** Country whose treasury and approval pay. */
  countryId: string | undefined;
  corporationId?: ObjectId;
  billId?: ObjectId;
  intensity: number;
  turn: number;
}

/**
 * Claims the (crisis, lever, holder, turn) slot, then charges the cost, then
 * releases the row to the turn phase. The unique index is the claim, so a
 * double submit loses at the insert and never reaches the charge. Any failure
 * after the claim refunds what was taken and frees the slot.
 */
export async function commitLeverUse(
  db: Db,
  args: CommitLeverArgs
): Promise<LeverResult<LeverUseSummary>> {
  const { crisis, lever, holderId, turn } = args;
  const cost = scaleCost(lever.cost, args.intensity);
  const { politicalCapital, ...chargeable } = cost;
  const actionsSpent = leverActionCost(politicalCapital);
  const holder = holderId.toString();
  const row: CrisisLeverUse = {
    _id: new ObjectId(),
    crisisId: crisis._id,
    leverId: lever.id,
    holderId: holder,
    intensity: args.intensity,
    submittedTurn: turn,
    appliedTurn: null,
    chargeState: "pending",
    cost,
    ...(args.corporationId ? { corporationId: args.corporationId } : {}),
    ...(args.billId ? { billId: args.billId } : {}),
    createdAt: new Date(),
  };

  const uses = db.collection<CrisisLeverUse>("crisisLeverUses");
  try {
    await uses.insertOne(row);
  } catch (error) {
    if (isDuplicateKey(error)) return fail("duplicate", "You already pulled this lever this turn");
    throw error;
  }

  let applied: Charge[] = [];
  try {
    const charged = await chargeCost(db, {
      cost: chargeable,
      countryId: args.countryId,
      corporationId: args.corporationId,
      receiptKey: `crisis-lever:${crisis._id.toString()}:${lever.id}:${holder}:${turn}`,
      actions: { characterId: holderId, count: actionsSpent },
    });
    if (!charged.ok) {
      await uses.deleteOne({ _id: row._id });
      return charged;
    }
    applied = charged.applied;
    await uses.updateOne({ _id: row._id }, { $set: { chargeState: "charged" } });
  } catch (error) {
    for (const charge of applied.reverse()) await charge.undo().catch(() => undefined);
    await uses.deleteOne({ _id: row._id }).catch(() => undefined);
    logger.error(COMPONENT, "lever use failed after claim; refunded", error, {
      crisisId: crisis._id.toString(),
      leverId: lever.id,
    });
    return fail("charge_failed", "Could not complete this response");
  }

  const undo = async () => {
    for (const charge of [...applied].reverse()) {
      await charge
        .undo()
        .catch((error) =>
          logger.error(COMPONENT, "lever refund failed", error, { useId: row._id.toString() })
        );
    }
    await uses.deleteOne({ _id: row._id });
  };

  return {
    ok: true,
    useId: row._id,
    cost,
    actionsSpent,
    undo,
  };
}

export interface LeverContext {
  crisis: LiveCrisis;
  def: CrisisDefinition;
  lever: CrisisLeverDef;
  actor: LeverActor;
  turn: number;
  countryIds: string[] | null;
}

/** Everything a pull or an emergency bill must satisfy except the cost itself. */
export async function checkLeverEligibility(
  db: Db,
  input: Pick<PullLeverInput, "crisisId" | "leverId" | "characterId">
): Promise<LeverResult<{ context: LeverContext }>> {
  const crisis = await loadLiveCrisis(db, input.crisisId);
  const def = crisis ? resolveCrisisDefinition(crisis.v2.definitionId) : undefined;
  const lever = def?.levers.find((candidate) => candidate.id === input.leverId);
  if (!crisis || !def || !lever) return fail("not_found", "No such response on this crisis");

  const actor = await (
    await getCharactersCollection(db)
  ).findOne({ _id: input.characterId }, { projection: { countryId: 1, currentOffice: 1 } });
  if (!actor) return fail("not_found", "No such character");

  const turn = (await getGameState(db))?.currentTurn ?? 0;
  const holder = actor._id.toString();
  const block = leverBlock(
    crisis.v2,
    lever,
    holder,
    turn,
    await lastPulledTurn(db, crisis._id, lever.id, holder)
  );
  if (block === "resolved") return fail("resolved", "This crisis has ended");
  if (block === "wrongStage")
    return fail("wrong_stage", "This response is not available at this stage");
  if (block === "cooldown") return fail("cooldown", "You pulled this lever too recently");
  if (block === "needsEmergency")
    return fail("needs_emergency", "This response needs a declared state of emergency");

  const countryIds = await crisisCountryIds(db, crisis);
  const roles = await resolveLeverRoles(db, actor, countryIds);
  if (!roles.has(lever.role))
    return fail("wrong_role", "You do not hold the office for this response");
  if (!leverInActorJurisdiction(lever, countryIds, actor.countryId)) {
    return fail("out_of_jurisdiction", "This crisis is outside your jurisdiction");
  }
  if (lever.role === "stateGovernor" && !governsAffectedState(actor, crisis)) {
    return fail("out_of_jurisdiction", "Your state is not affected by this crisis");
  }
  return { ok: true, context: { crisis, def, lever, actor, turn, countryIds } };
}

/**
 * Pulls a lever on a Crisis v2 crisis for one character: validates role,
 * jurisdiction, stage and cooldown, then claims the slot and charges the cost.
 * Legislature levers go through an emergency bill instead.
 */
export async function pullLever(
  db: Db,
  input: PullLeverInput
): Promise<LeverResult<LeverUseSummary>> {
  const eligible = await checkLeverEligibility(db, input);
  if (!eligible.ok) return eligible;
  const { crisis, lever, actor, turn, countryIds } = eligible.context;
  if (lever.role === "legislature") {
    return fail("needs_bill", "This response needs an emergency bill");
  }

  let corporationId: ObjectId | undefined;
  if (lever.role === "corpCeo" || (lever.cost.corpCash ?? 0) > 0) {
    if (!input.corporationId)
      return fail("needs_corporation", "Pick the corporation that responds");
    const corporation = await (
      await getCorporationsCollection(db)
    ).findOne(
      { _id: input.corporationId, ceoId: actor._id, ceoType: { $nin: ["npp", "imperial"] } },
      { projection: { countryId: 1 } }
    );
    if (!corporation) return fail("wrong_role", "You do not run that corporation");
    if (countryIds && !countryIds.includes(corporation.countryId)) {
      return fail("out_of_jurisdiction", "That corporation is outside this crisis");
    }
    corporationId = input.corporationId;
  }

  return commitLeverUse(db, {
    crisis,
    lever,
    holderId: actor._id,
    countryId: actor.countryId,
    corporationId,
    intensity: clamp(input.intensity ?? 1, 0, 1),
    turn,
  });
}
