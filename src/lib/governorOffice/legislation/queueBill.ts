import type { Db, ObjectId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import type {
  Character,
  GovernorQueuedBill,
  NPP,
  ElectedOfficial,
  StateBill,
  StateBillProvision,
} from "@/lib/db/types";
import { getSubNationalLegislatureKey, type CountryId } from "@/lib/constants/countries";
import { STATE_TERMINAL_STATUSES } from "@/lib/congress/billProposalLimits";
import { BILL_PROPOSE_ACTION_COST, getProvisionCostTotal } from "@shared/constants/legislation";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { getGameState } from "@/lib/gameState";
import { validateStateBillProvisions } from "@/lib/legislature/commands/validateStateBillProvisions";

export interface QueueBillInput {
  countryId: CountryId;
  stateId: string;
  character: {
    _id: ObjectId;
    name: string;
    party?: string;
  };
  targetNppId: ObjectId;
  title: string;
  summary: string;
  category?: string;
  legislationTypeId?: string;
  effectDirection?: number;
  provisions?: StateBillProvision[];
}

/**
 * Queue a state bill that will fire next turn introduced by `targetNppId`.
 * Governor pays the full proposal cost up-front; the cost is refunded on
 * cancellation or auto-cancellation.
 *
 * Enforces:
 * - One pending queue per state.
 * - Target NPP is in the governor's party, holds a state-legislature seat, and
 *   has no active bill in flight.
 * - Governor has sufficient action points + NPI.
 */
export async function queueBill(
  db: Db,
  input: QueueBillInput
): Promise<{ status: number; body: { queueId?: string; error?: string } }> {
  const {
    countryId,
    stateId,
    character,
    targetNppId,
    title,
    summary,
    category,
    legislationTypeId,
    effectDirection,
    provisions,
  } = input;

  // One pending queue per state.
  const pending = await db.collection<GovernorQueuedBill>("governorLegislationQueue").findOne({
    countryId,
    stateId,
    status: "pending",
  });
  if (pending) {
    return { status: 409, body: { error: "A queued bill is already pending for this state." } };
  }

  // Target NPP eligibility.
  const npp = await db.collection<NPP>("npps").findOne({ _id: targetNppId });
  if (!npp || npp.retiredAt != null) {
    return { status: 400, body: { error: "Target NPP is unavailable." } };
  }
  if (npp.party !== character.party) {
    return { status: 400, body: { error: "NPP is not in your party." } };
  }
  const seat = await db.collection<ElectedOfficial>("electedOfficials").findOne({
    nppId: targetNppId,
    officeType: getSubNationalLegislatureKey(countryId),
    state: stateId.toUpperCase(),
  });
  if (!seat) {
    return {
      status: 400,
      body: { error: "NPP does not hold a state-legislature seat in this state." },
    };
  }
  const activeNppBill = await db.collection<StateBill>("stateBills").findOne({
    sponsorNppId: targetNppId,
    status: { $nin: STATE_TERMINAL_STATUSES },
  });
  if (activeNppBill) {
    return { status: 400, body: { error: "NPP already has an active bill in flight." } };
  }

  // The same provision gate a direct proposal runs: reviewed v2 law selections
  // are resolved against the region's catalog and frozen with the snapshot
  // enactment needs, tax rates are stamped, and subsidies, duplicates and the
  // current law are checked.
  const validation = await validateStateBillProvisions(db, {
    countryId,
    stateId: stateId.toUpperCase(),
    gameState: await getGameState(db),
    category,
    provisions,
  });
  if (!validation.ok) {
    return { status: validation.status, body: { error: validation.error } };
  }
  const { provisions: stampedProvisions, influenceProvisionCount: influenceCount } = validation;

  const npiCost = getProvisionCostTotal(influenceCount);
  const actionCost = BILL_PROPOSE_ACTION_COST;

  // Atomic spend.
  const spend = await db.collection<Character>("characters").updateOne(
    {
      _id: character._id,
      actions: { $gte: actionCost },
      ...(npiCost > 0 ? { nationalInfluence: { $gte: npiCost } } : {}),
    },
    {
      $inc: {
        actions: -actionCost,
        ...(npiCost > 0 ? { nationalInfluence: -npiCost } : {}),
      },
      $set: { updatedAt: new Date() },
    }
  );
  if (spend.modifiedCount === 0) {
    return { status: 400, body: { error: "Insufficient actions or NPI." } };
  }

  const currentTurn = await getCurrentTurn(db);
  const id = new MongoObjectId();
  const doc: GovernorQueuedBill = {
    _id: id,
    countryId,
    stateId,
    governorCharacterId: character._id,
    governorName: character.name,
    targetNppId,
    targetNppName: npp.name,
    targetPartyId: npp.party!,
    title: title.trim(),
    summary: summary.trim(),
    ...(category ? { category } : {}),
    ...(legislationTypeId ? { legislationTypeId } : {}),
    ...(effectDirection !== undefined ? { effectDirection } : {}),
    ...(stampedProvisions ? { provisions: stampedProvisions } : {}),
    proposalActionCost: actionCost,
    proposalNpiCost: npiCost,
    queuedAtTurn: currentTurn,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection<GovernorQueuedBill>("governorLegislationQueue").insertOne(doc);
  return { status: 200, body: { queueId: id.toString() } };
}
