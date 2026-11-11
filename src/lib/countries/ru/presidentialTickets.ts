/**
 * Russian direct candidates register a president and vice-president ticket.
 * A chosen player running mate is preserved; an unpaired ticket is filled
 * from a distinct same-party NPC.
 */
import { type Db, type ClientSession } from "mongodb";
import type { Election, ElectionCandidate, NPP } from "@/lib/db/types";
import { chooseRussianNpcRunningMate } from "./rules/presidentialTicket";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
export async function materializeRussianPresidentialTickets(input: {
  db: Db;
  session: ClientSession;
  election: Election;
  now: Date;
}) {
  const { db, session, election } = input;
  if (!session.inTransaction()) throw new Error("Russian tickets require an active transaction");
  if (
    election.countryId !== "RU" ||
    election.electionType !== "president" ||
    !election.russianPresidentialRound
  )
    return;
  const candidates = await electionCandidatesCollection(db)
    .find(
      { electionId: election._id, status: "active", russianTicketLocked: { $ne: true } },
      {
        session,
        projection: {
          party: 1,
          isNPP: 1,
          nppId: 1,
          characterId: 1,
          runningMateId: 1,
          russianRunningMateNppId: 1,
        },
      }
    )
    .toArray();
  const missing = candidates.filter((c) => !c.runningMateId && !c.russianRunningMateNppId);
  if (!candidates.length) return;
  const pool = missing.length
    ? await nppsCollection(db)
        .find(
          {
            countryId: "RU",
            party: { $in: [...new Set(missing.map((c) => c.party))] },
            isTechnocrat: { $ne: true },
            $or: [{ retiredAt: null }, { retiredAt: { $exists: false } }],
          },
          { session, projection: { party: 1, currentOffice: 1 } }
        )
        .toArray()
    : [];
  const reserved = new Set(
    candidates.flatMap((c) =>
      [c.nppId, c.russianRunningMateNppId].filter(Boolean).map((id) => id!.toHexString())
    )
  );
  const writes = [];
  for (const candidate of candidates) {
    if (candidate.runningMateId || candidate.russianRunningMateNppId) {
      writes.push({
        updateOne: {
          filter: {
            _id: candidate._id,
            status: "active" as const,
            runningMateId: candidate.runningMateId ?? { $exists: false },
            russianRunningMateNppId: candidate.russianRunningMateNppId ?? { $exists: false },
            russianTicketLocked: { $ne: true },
          },
          update: { $set: { russianTicketLocked: true } },
        },
      });
      continue;
    }
    const selected = chooseRussianNpcRunningMate(
      candidate.party,
      pool.map((n) => ({
        id: n._id.toHexString(),
        party: n.party,
        officeType: n.currentOffice?.type,
      })),
      reserved
    );
    const mate = pool.find((n) => n._id.toHexString() === selected);
    if (!mate) throw new Error("Russian presidential ticket needs an eligible running mate");
    reserved.add(mate._id.toHexString());
    writes.push({
      updateOne: {
        filter: {
          _id: candidate._id,
          status: "active" as const,
          russianTicketLocked: { $ne: true },
          runningMateId:
            candidate.runningMateId === undefined ? { $exists: false } : candidate.runningMateId,
          russianRunningMateNppId:
            candidate.russianRunningMateNppId === undefined
              ? { $exists: false }
              : candidate.russianRunningMateNppId,
        },
        update: { $set: { russianRunningMateNppId: mate._id, russianTicketLocked: true } },
      },
    });
  }
  const saved = await electionCandidatesCollection(db)
    .bulkWrite(writes, { session });
  if (saved.matchedCount !== writes.length)
    throw new Error("Russian presidential ticket changed during registration");
}
export async function prepareRussianPresidentialTickets(
  input: Omit<Parameters<typeof materializeRussianPresidentialTickets>[0], "session">
) {
  return runRequiredTransaction(
    (session) => materializeRussianPresidentialTickets({ ...input, session }),
    { client: input.db.client }
  );
}
