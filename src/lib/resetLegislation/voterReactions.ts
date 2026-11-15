import { ObjectId, type ClientSession, type Db, type AnyBulkWriteOperation } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { Character, NPP } from "@/lib/db/types";
import type { ResetLawProvision } from "@/lib/db/types/legislation";
import { finalV2Voters, v2EnactmentApproval, type VoterChoice } from "./rules/voterReactions";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";

export interface V2BillBallots {
  votes?: Record<string, VoterChoice>;
  otherChamberVotes?: Record<string, VoterChoice>;
  vetoOverrideVotes?: Record<string, VoterChoice>;
  overrideVotes?: Record<string, VoterChoice>;
}

/** Called inside the law-program transaction, before its exactly-once receipt is written. */
export async function applyV2VoterReactions(
  db: Db,
  bill: V2BillBallots,
  countryId: CountryId,
  provisions: readonly ResetLawProvision[],
  currentChoices: ReadonlyMap<string, ResetLawProvision["choice"]>,
  session: ClientSession
): Promise<void> {
  const impacts = v2EnactmentApproval(
    provisions.map((provision) => ({
      ...provision,
      currentChoiceSnapshot:
        currentChoices.get(provision.familyId) ?? provision.currentChoiceSnapshot,
    })),
    countryId
  );
  await applyVoterApprovalImpacts(db, bill, countryId, impacts, session);
}

/** Shared transactional write path for law-family and exact-rate tax reactions. */
export async function applyVoterApprovalImpacts(
  db: Db,
  bill: V2BillBallots,
  countryId: CountryId,
  impacts: Readonly<Record<string, number>>,
  session: ClientSession
): Promise<void> {
  if (!Object.keys(impacts).length) return;
  const characters: AnyBulkWriteOperation<Character>[] = [];
  const npps: AnyBulkWriteOperation<NPP>[] = [];
  for (const voter of finalV2Voters([
    bill.votes,
    bill.otherChamberVotes,
    bill.vetoOverrideVotes,
    bill.overrideVotes,
  ])) {
    const direction = voter.vote === "for" ? 1 : -1;
    const fields = Object.fromEntries(
      Object.entries(impacts).map(([bucket, amount]) => [
        `bucketApprovals.${bucket}`,
        {
          $min: [
            100,
            {
              $max: [
                -100,
                { $add: [{ $ifNull: [`$bucketApprovals.${bucket}`, 0] }, direction * amount] },
              ],
            },
          ],
        },
      ])
    );
    const operation = {
      updateOne: {
        filter: {
          _id: new ObjectId(voter.id),
          ...(countryId === COUNTRY_CONFIGS.US.id
            ? { $or: [{ countryId }, { countryId: { $exists: false } }] }
            : { countryId }),
        },
        update: [{ $set: fields }],
      },
    };
    if (voter.kind === "npp") npps.push(operation);
    else characters.push(operation);
  }
  if (characters.length) await charactersCollection(db).bulkWrite(characters, { session });
  if (npps.length) await nppsCollection(db).bulkWrite(npps, { session });
}
