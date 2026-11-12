import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getNationalDocId } from "@/lib/constants/nationalScope";
import type { Bill, BillChamber } from "@/lib/db/types";
import { getGameState } from "@/lib/gameState";
import { billsCollection } from "@/lib/db/repositories/bills";

/** Fast-track window, in turns, for a bill answering a live crisis. */
export const EMERGENCY_BILL_VOTING_TURNS = 12;
const TURN_MS = 60 * 60 * 1000;

export interface ProposeCrisisEmergencyBillInput {
  countryId: CountryId;
  crisisId: ObjectId;
  leverId: string;
  sponsorId: ObjectId;
  sponsorName: string;
  sponsorParty?: string;
  title: string;
  summary: string;
}

/**
 * Inserts a fast-track emergency bill into the sponsor's lower chamber. Like a
 * crisis aid bill it carries no provisions and votes through the normal
 * cross-pressure engine; the Crisis v2 turn phase records the lever use or the
 * inaction once it resolves. The voting window is shorter than a regular bill's.
 */
export async function proposeCrisisEmergencyBill(
  db: Db,
  input: ProposeCrisisEmergencyBillInput
): Promise<ObjectId> {
  const chamberKey = COUNTRY_CONFIGS[input.countryId].legislature.lowerChamber.key as BillChamber;
  const now = new Date();
  const currentTurn = (await getGameState(db))?.currentTurn ?? 0;
  const stateId = getNationalDocId(input.countryId) ?? `${input.countryId.toLowerCase()}_national`;

  const bill: Omit<Bill, "_id"> = {
    countryId: input.countryId,
    stateId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    originChamber: chamberKey,
    currentChamber: chamberKey,
    sponsorId: input.sponsorId,
    sponsorName: input.sponsorName,
    sponsorParty: input.sponsorParty,
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    category: "economy",
    provisions: [],
    crisisEmergency: {
      crisisId: input.crisisId,
      leverId: input.leverId,
      holderId: input.sponsorId,
    },
    proposedAt: now,
    votingStartedAt: now,
    votingEndsAt: new Date(now.getTime() + EMERGENCY_BILL_VOTING_TURNS * TURN_MS),
    votingEndsOnTurn: currentTurn + EMERGENCY_BILL_VOTING_TURNS,
    createdAt: now,
    updatedAt: now,
  };

  const result = await billsCollection<Omit<Bill, "_id">>(db).insertOne(bill);
  return result.insertedId;
}
