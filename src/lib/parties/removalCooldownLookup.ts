import type { Db, ObjectId } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import { committeeProposalsCollection } from "@/lib/db/repositories/committeeProposals";
import { nationalCommitteeElectionsCollection } from "@/lib/db/repositories/nationalCommitteeElections";
import { nationalPartyElectionsCollection } from "@/lib/db/repositories/nationalPartyElections";
import { removalVoteCooldown, type RemovalCooldown } from "./rules/removalVoteCooldown";
import type { RemovableOfficeRole } from "./rules/officeRemovalNotice";

export interface RemovalTarget {
  role: RemovableOfficeRole;
  characterId: ObjectId;
}

export function removalTargetKey(
  role: RemovableOfficeRole,
  characterId: ObjectId | string
): string {
  return `${role}:${characterId.toString()}`;
}

type CooldownParty = Pick<PoliticalParty, "_id" | "sequentialId" | "countryId" | "createdTurn">;

function keepLatest(map: Map<string, number>, key: string, turn: number | undefined | null) {
  if (typeof turn !== "number") return;
  const prev = map.get(key);
  if (prev === undefined || turn > prev) map.set(key, turn);
}

/**
 * Removal-vote cooldown for each target, keyed by `removalTargetKey`. The seat
 * turn comes from the record that seated the holder: the leadership or
 * committee election they won, the committee vote that confirmed a campaigner,
 * or the charter that made a founder the first chair.
 */
export async function loadRemovalCooldowns(
  db: Db,
  party: CooldownParty,
  targets: RemovalTarget[],
  currentTurn: number
): Promise<Map<string, RemovalCooldown>> {
  const out = new Map<string, RemovalCooldown>();
  if (targets.length === 0) return out;
  const ids = targets.map((t) => t.characterId);
  const partyId = String(party.sequentialId);
  const countryId = party.countryId ?? "US";

  const [leadershipWins, committeeWins, proposals] = await Promise.all([
    nationalPartyElectionsCollection(db)
      .find(
        { partyId, countryId, status: "completed", winnerId: { $in: ids } },
        { projection: { position: 1, winnerId: 1, endTurn: 1 } }
      )
      .toArray(),
    nationalCommitteeElectionsCollection(db)
      .find(
        { partyId, countryId, status: "completed", winnerIds: { $in: ids } },
        { projection: { winnerIds: 1, endTurn: 1 } }
      )
      .toArray(),
    committeeProposalsCollection(db)
      .find(
        {
          partyId: party._id,
          $or: [
            {
              type: "campaignerAppointment",
              status: "passed",
              "campaignerAppointment.targetCharacterId": { $in: ids },
            },
            {
              type: "removeOfficeHolder",
              status: { $in: ["rejected", "expired"] },
              "removeOfficeHolder.targetCharacterId": { $in: ids },
            },
          ],
        },
        {
          projection: {
            type: 1,
            resolvedAtTurn: 1,
            campaignerAppointment: 1,
            removeOfficeHolder: 1,
          },
        }
      )
      .toArray(),
  ]);

  const seated = new Map<string, number>();
  const failed = new Map<string, number>();
  for (const e of leadershipWins) {
    if (e.winnerId) keepLatest(seated, removalTargetKey(e.position, e.winnerId), e.endTurn);
  }
  for (const e of committeeWins) {
    for (const id of e.winnerIds ?? []) {
      keepLatest(seated, removalTargetKey("committeeMember", id), e.endTurn);
    }
  }
  for (const p of proposals) {
    if (p.type === "campaignerAppointment" && p.campaignerAppointment) {
      const key = removalTargetKey("campaigner", p.campaignerAppointment.targetCharacterId);
      keepLatest(seated, key, p.resolvedAtTurn);
    } else if (p.type === "removeOfficeHolder" && p.removeOfficeHolder) {
      keepLatest(failed, p.removeOfficeHolder.targetCharacterId.toString(), p.resolvedAtTurn);
    }
  }

  for (const { role, characterId } of targets) {
    const key = removalTargetKey(role, characterId);
    let seatedTurn = seated.get(key) ?? null;
    // A charter founder holds the chair from the founding turn without an election.
    if (seatedTurn == null && role === "chair" && typeof party.createdTurn === "number") {
      seatedTurn = party.createdTurn;
    }
    out.set(
      key,
      removalVoteCooldown({
        currentTurn,
        seatedTurn,
        lastFailedRemovalTurn: failed.get(characterId.toString()) ?? null,
      })
    );
  }
  return out;
}
