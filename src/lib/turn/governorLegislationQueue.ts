import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { stateBillProvisionSchema } from "@/lib/api/schemas/congress";
import type { GovernorQueuedBill, NPP, ElectedOfficial, StateBill } from "@/lib/db/types";
import { getSubNationalLegislatureKey } from "@/lib/constants/countries";
import { STATE_TERMINAL_STATUSES } from "@/lib/congress/billProposalLimits";
import { cancelQueue } from "@/lib/governorOffice/legislation/cancelQueue";
import { canManageOffice } from "@/lib/governorOffice/access";
import { snapshotPolicyProvisionsInPlace } from "@/lib/legislature/provisionEnrichment";

const VOTING_DURATION_HOURS = 24;

/**
 * Turn phase: fire every pending GovernorQueuedBill whose
 * queuedAtTurn < currentTurn. Each entry either becomes a real StateBill
 * (with sponsorNppId set + proposedByGovernor metadata) or is auto-cancelled
 * with refund if the target NPP / governor became ineligible.
 *
 * Must run BEFORE processStateBillVoting so the new bill is visible for
 * voting on its first turn.
 */
export async function processGovernorLegislationQueue(
  db: Db,
  currentTurn: number
): Promise<{ fired: number; cancelled: number }> {
  const pending = await db
    .collection<GovernorQueuedBill>("governorLegislationQueue")
    .find({ status: "pending", queuedAtTurn: { $lt: currentTurn } })
    .toArray();
  let fired = 0;
  let cancelled = 0;
  const now = new Date();

  // A reviewed v2 law family may sit in one active bill per region. Queue time
  // checked that, but a member can propose the same family directly before the
  // queue fires, so read the regions' active law families once and re-check.
  const resetFamilyKey = (countryId: string, stateId: string, familyId: string) =>
    `${countryId}:${stateId.toUpperCase()}:${familyId}`;
  const queuedResetFamilies = (q: GovernorQueuedBill) =>
    (q.provisions ?? []).flatMap((provision) =>
      provision.type === "reset_law" ? [provision.familyId] : []
    );
  const activeResetFamilies = new Set<string>();
  const regionsWithQueuedLaws = [
    ...new Set(
      pending.filter((q) => queuedResetFamilies(q).length > 0).map((q) => q.stateId.toUpperCase())
    ),
  ];
  if (regionsWithQueuedLaws.length > 0) {
    const activeLawBills = await db
      .collection<StateBill>("stateBills")
      .find({
        stateId: { $in: regionsWithQueuedLaws },
        status: { $nin: STATE_TERMINAL_STATUSES },
        "provisions.type": "reset_law",
      })
      .project<Pick<StateBill, "countryId" | "stateId" | "provisions">>({
        countryId: 1,
        stateId: 1,
        "provisions.type": 1,
        "provisions.familyId": 1,
      })
      .toArray();
    for (const bill of activeLawBills) {
      for (const provision of bill.provisions ?? []) {
        if (provision.type === "reset_law" && bill.countryId) {
          activeResetFamilies.add(resetFamilyKey(bill.countryId, bill.stateId, provision.familyId));
        }
      }
    }
  }

  for (const q of pending) {
    if (!q._id) continue;

    // 1. Queuer still authorized to manage this office? The human holder
    //    qualifies; for an NPP-held office an authorized party officer (state
    //    Chair/Vice, or national Chair/Vice when the state party has neither)
    //    qualifies too — the same delegation that allowed queuing the bill.
    //    (A by-characterId holder lookup would always fail for NPP-held offices,
    //    whose seat has no character, so officer-queued bills must use this.)
    const stillAuthorized = await canManageOffice(
      db,
      q.countryId,
      q.stateId,
      q.governorCharacterId
    );
    if (!stillAuthorized) {
      await cancelQueue(db, q._id, "governor_left_office");
      cancelled++;
      continue;
    }

    // 2. NPP still eligible?
    const npp = await db.collection<NPP>("npps").findOne({ _id: q.targetNppId });
    if (!npp || npp.retiredAt != null) {
      await cancelQueue(db, q._id, "npp_retired");
      cancelled++;
      continue;
    }
    if (npp.party !== q.targetPartyId) {
      await cancelQueue(db, q._id, "npp_party_changed");
      cancelled++;
      continue;
    }
    const seat = await db.collection<ElectedOfficial>("electedOfficials").findOne({
      nppId: q.targetNppId,
      officeType: getSubNationalLegislatureKey(q.countryId),
      state: q.stateId.toUpperCase(),
    });
    if (!seat) {
      await cancelQueue(db, q._id, "npp_lost_seat");
      cancelled++;
      continue;
    }
    const activeNppBill = await db.collection<StateBill>("stateBills").findOne({
      sponsorNppId: q.targetNppId,
      status: { $nin: STATE_TERMINAL_STATUSES },
    });
    if (activeNppBill) {
      await cancelQueue(db, q._id, "npp_already_has_active_bill");
      cancelled++;
      continue;
    }

    // 2b. Re-validate provisions at fire time (audit S6): queue entries written
    //     before the strict queue-time schema landed (or via any other writer)
    //     must not smuggle unsupported provision types into enactment.
    if (q.provisions?.length) {
      const provisionCheck = z.array(stateBillProvisionSchema).safeParse(q.provisions);
      if (!provisionCheck.success) {
        await cancelQueue(db, q._id, "invalid_provisions");
        cancelled++;
        continue;
      }
    }
    const lawFamilyKeys = queuedResetFamilies(q).map((familyId) =>
      resetFamilyKey(q.countryId, q.stateId, familyId)
    );
    if (lawFamilyKeys.some((key) => activeResetFamilies.has(key))) {
      await cancelQueue(db, q._id, "invalid_provisions");
      cancelled++;
      continue;
    }

    // 3. Fire — insert the StateBill with NPP sponsor + governor metadata.
    // The sponsoring NPP auto-votes "for" on their own bill at fire time so
    // the cross-pressure system in processStateBillVoting skips them (the
    // existingVotes[nppKey] check). This applies to ONLY this NPP — every
    // other party-member NPP still resolves through cross-pressure.
    const sponsorVoteWeight = seat.seatsHeld ?? 1;
    const sponsorVoteKey = `npp_${q.targetNppId.toString()}`;
    const billId = new ObjectId();
    const votingEndsAt = new Date(now.getTime() + VOTING_DURATION_HOURS * 3_600_000);

    // Fire time is this queue's analogue of proposal, so freeze the proposed and
    // current option labels here. Without them the bill detail page re-reads the
    // live law and, once the bill enacts, shows the bill's own outcome as the
    // current law.
    const queuedProvisions = q.provisions ? [...q.provisions] : undefined;
    if (queuedProvisions?.length) {
      await snapshotPolicyProvisionsInPlace(db, queuedProvisions, {
        scope: "region",
        countryId: q.countryId,
        regionId: q.stateId,
      });
    }
    const bill: StateBill = {
      _id: billId,
      stateId: q.stateId,
      countryId: q.countryId,
      title: q.title,
      summary: q.summary,
      sponsorId: null,
      sponsorName: q.targetNppName,
      sponsorParty: q.targetPartyId,
      sponsorNppId: q.targetNppId,
      isNPP: true,
      nppId: q.targetNppId,
      proposedByGovernor: {
        characterId: q.governorCharacterId,
        name: q.governorName,
      },
      proposalPayerId: q.governorCharacterId,
      status: "active",
      votesFor: sponsorVoteWeight,
      votesAgainst: 0,
      votesAbstain: 0,
      votes: { [sponsorVoteKey]: "for" },
      ...(q.category ? { category: q.category } : {}),
      ...(q.legislationTypeId ? { legislationTypeId: q.legislationTypeId } : {}),
      ...(q.effectDirection !== undefined ? { effectDirection: q.effectDirection } : {}),
      ...(queuedProvisions ? { provisions: queuedProvisions } : {}),
      proposalActionCost: q.proposalActionCost,
      proposalNpiCost: q.proposalNpiCost,
      proposedAt: now,
      votingStartedAt: now,
      votingEndsAt,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<StateBill>("stateBills").insertOne(bill);
    for (const key of lawFamilyKeys) activeResetFamilies.add(key);

    await db.collection<GovernorQueuedBill>("governorLegislationQueue").updateOne(
      { _id: q._id, status: "pending" },
      {
        $set: {
          status: "fired",
          firedBillId: billId,
          updatedAt: new Date(),
        },
      }
    );
    fired++;
  }

  return { fired, cancelled };
}
