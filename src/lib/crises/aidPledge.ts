// src/lib/crises/aidPledge.ts
import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { CrisisEffect, CrisisInteraction } from "@/lib/db/types/crisis";
import type { CrisisAidCommitment } from "@/lib/db/types/crisisAid";
import { AID_MAX_PCT_GDP } from "@/lib/constants/crises";
import { badRequest, forbidden, conflict, notFound } from "@/lib/api/errors";
import {
  refundTreasurySpend,
  spendFromTreasury,
  type FiscalImpact,
} from "@/lib/budget/treasurySpend";
import { computeAidOutcome } from "@/lib/crises/aidScaling";
import { applyCrisisEffects } from "@/lib/crises/applyEffects";
import { applyEffectsForCrisis } from "@/lib/crises/interactionEngine";
import { proposeCrisisAidBill } from "@/lib/legislature/commands/proposeCrisisAidBill";
import { logWireEvent } from "@/lib/wireEvent";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { crisesCollection } from "@/lib/db/repositories/crises";
import type { Document } from "mongodb";
import { crisisInteractionsCollection } from "@/lib/db/repositories/crisisInteractions";
import { billsCollection } from "@/lib/db/repositories/bills";
import { crisisAidCommitmentsCollection } from "@/lib/db/repositories/crisisAidCommitments";

export interface SubmitCrisisAidPledgeInput {
  interactionId: ObjectId;
  nodeId: string;
  pctGdp: number;
  characterId: ObjectId;
  characterName: string;
  senderCountryId: CountryId;
  characterParty?: string;
  characterRoles: string[];
}

const HEAD_OF_STATE_ROLE = "headOfState";

/**
 * Provisionally resolve an aid pledge "as if it passes": spend (surplus/debt),
 * apply scaled recovery to the crisis + a diplomatic bump to the sender, file an
 * appropriation bill in the sender's legislature, and record a commitment for
 * the resolution sweep to finalize or claw back. The crisis advances to terminal
 * independently of the bill's fate.
 */
export async function submitCrisisAidPledge(
  db: Db,
  input: SubmitCrisisAidPledgeInput
): Promise<{ commitmentId: ObjectId; billId: ObjectId; impact: FiscalImpact }> {
  const interaction = await crisisInteractionsCollection(db).findOne({ _id: input.interactionId });
  if (!interaction) throw notFound("Crisis interaction not found");
  if (interaction.resolvedAt) throw conflict("Crisis already resolved");

  const node = interaction.decisionTree.find((n) => n.nodeId === input.nodeId);
  if (!node || node.type !== "aid") throw badRequest("Node is not an aid node");
  if (node.nodeId !== interaction.currentNodeId) throw badRequest("Aid node is not active");

  if (!input.characterRoles.includes(HEAD_OF_STATE_ROLE)) {
    throw forbidden("Only a head of state can pledge aid");
  }

  const already = await crisisAidCommitmentsCollection(db).findOne({
    crisisId: interaction.crisisId,
    senderCountryId: input.senderCountryId,
  });
  if (already) throw conflict("Your country has already pledged aid to this crisis");

  const maxPct = node.aidMaxPctGdp ?? AID_MAX_PCT_GDP;
  if (!(input.pctGdp > 0) || input.pctGdp > maxPct) {
    throw badRequest("Invalid aid amount");
  }

  const budget = await federalBudgetCollection(db).findOne({ countryId: input.senderCountryId });
  const senderGdp =
    budget?.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : (budget?.gdp ?? 0);
  if (senderGdp <= 0) throw badRequest("Sender GDP unavailable");

  const { amountLocal, recoveryEffects, senderEffects } = computeAidOutcome(
    input.pctGdp,
    senderGdp
  );
  if (amountLocal <= 0) throw badRequest("Aid amount rounds to zero");
  const commitmentId = new ObjectId();
  const billId = new ObjectId();

  // 1. Claim the pledge slot. The unique (crisis, sender) index makes this the
  // single arbiter between concurrent requests, so nothing below can run twice.
  const now = new Date();
  const commitments = crisisAidCommitmentsCollection(db);
  try {
    await commitments.insertOne({
      _id: commitmentId,
      crisisId: interaction.crisisId,
      billId,
      senderCountryId: input.senderCountryId,
      proposerCharacterId: input.characterId,
      proposerName: input.characterName,
      amountLocal,
      amountPctGdp: input.pctGdp,
      recoveryEffects,
      senderEffects,
      treasuryDebited: amountLocal,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict("Your country has already pledged aid to this crisis");
    }
    throw err;
  }

  // 2. Spend (surplus first, remainder = debt; derived fields resynced now).
  let impact: FiscalImpact;
  try {
    impact = await spendFromTreasury(db, input.senderCountryId, amountLocal, {
      resyncDerived: true,
      witness: {
        flow: "crisis_aid",
        key: `crisis-aid:${interaction.crisisId.toString()}:${input.senderCountryId}`,
        site: "crises/aidPledge",
      },
    });
  } catch (err) {
    await commitments.deleteOne({ _id: commitmentId });
    throw err;
  }

  // 3-5 run after the money has left, so any failure gives it back and frees the slot.
  const spendKey = `crisis-aid:${interaction.crisisId.toString()}:${input.senderCountryId}`;
  const applied = { recovery: false, sender: false };
  try {
    // 3. Provisionally apply benefits.
    await applyEffectsForCrisis(db, interaction.crisisId, recoveryEffects);
    applied.recovery = true;
    await applyCrisisEffects(db, senderEffects, [], [input.senderCountryId]);
    applied.sender = true;

    // 4. File the appropriation bill under the id the commitment already names.
    const crisis = await crisesCollection<Document>(db).findOne({ _id: interaction.crisisId });
    const crisisName = (crisis as { name?: string } | null)?.name ?? "a foreign crisis";
    await proposeCrisisAidBill(db, {
      billId,
      countryId: input.senderCountryId,
      crisisAidId: commitmentId,
      sponsorId: input.characterId,
      sponsorName: input.characterName,
      sponsorParty: input.characterParty,
      title: `Emergency Aid: ${crisisName}`,
      summary: `Appropriate ${amountLocal.toLocaleString()} in reconstruction aid for ${crisisName} (${(input.pctGdp * 100).toFixed(2)}% of GDP).`,
    });

    // 5. Advance the crisis to its terminal node (resolves the interaction).
    await crisisInteractionsCollection(db).updateOne(
      { _id: interaction._id },
      {
        $set: {
          currentNodeId: null,
          decisionDeadline: null,
          resolvedAt: now,
          resolutionOutcome: "success",
          updatedAt: now,
        },
        $push: { resolutionPath: input.nodeId },
      }
    );
  } catch (err) {
    await undoProvisionalPledge(db, {
      commitmentId,
      billId,
      crisisId: interaction.crisisId,
      senderCountryId: input.senderCountryId,
      amountLocal,
      spendKey,
      recoveryEffects: applied.recovery ? recoveryEffects : [],
      senderEffects: applied.sender ? senderEffects : [],
    });
    throw err;
  }

  await logWireEvent("crisis_aid_pledged", `${input.characterName} pledged emergency aid.`, {
    href: `/world/crises/${interaction.crisisId.toString()}`,
  });

  return { commitmentId, billId, impact };
}

function negate(effects: CrisisEffect[]): CrisisEffect[] {
  return effects.map((e) => ({ ...e, value: -e.value }));
}

/** Give back everything a half-finished pledge took, then release its slot. */
async function undoProvisionalPledge(
  db: Db,
  undo: {
    commitmentId: ObjectId;
    billId: ObjectId;
    crisisId: ObjectId;
    senderCountryId: CountryId;
    amountLocal: number;
    spendKey: string;
    recoveryEffects: CrisisEffect[];
    senderEffects: CrisisEffect[];
  }
): Promise<void> {
  await refundTreasurySpend(db, undo.senderCountryId, undo.amountLocal, {
    flow: "crisis_aid",
    key: undo.spendKey,
    site: "crises/aidPledge",
  });
  if (undo.recoveryEffects.length > 0) {
    await applyEffectsForCrisis(db, undo.crisisId, negate(undo.recoveryEffects));
  }
  if (undo.senderEffects.length > 0) {
    await applyCrisisEffects(db, negate(undo.senderEffects), [], [undo.senderCountryId]);
  }
  await billsCollection(db).deleteOne({ _id: undo.billId });
  await crisisAidCommitmentsCollection(db).deleteOne({ _id: undo.commitmentId });
}
