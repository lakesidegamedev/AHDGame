import { ObjectId, type Db, type AnyBulkWriteOperation } from "mongodb";
import type { RecruitmentSlate, SlateCandidate } from "@/lib/db/types/recruitmentSlate";
import type { CountryId } from "@/lib/constants/countries";
import { groupRemappedSlates, groupSlateCandidates } from "./rules/slateRemap";
import { slateCandidatesCollection } from "@/lib/db/repositories/slateCandidates";
import { recruitmentSlatesCollection } from "@/lib/db/repositories/recruitmentSlates";

/** Called inside the secession transaction, after geographic fanout.
 * Consolidate the planning surfaces, retain their candidate histories and keep
 * ballot candidates and votes untouched. Temporary keys are never committed.
 */
export async function remapRecruitmentSlates(
  db: Db,
  fromCountryId: CountryId,
  toCountryId: CountryId,
  idMap: Record<number, number>,
  now: Date
): Promise<void> {
  const slates = recruitmentSlatesCollection(db);
  const rows = await slates
    .find({
      $or: [
        { countryId: toCountryId },
        { countryId: fromCountryId, partyId: { $in: Object.keys(idMap) } },
      ],
    })
    .toArray();
  if (!rows.length) return;
  const candidates = slateCandidatesCollection(db);
  const candidateRows = await candidates
    .find({ slateId: { $in: rows.map((row) => row._id) } })
    .toArray();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const groups = groupRemappedSlates(
    rows.map((row) => ({
      id: String(row._id),
      electionId: String(row.electionId),
      countryId: row.countryId,
      partyId:
        row.countryId === toCountryId && idMap[Number(row.partyId)] != null
          ? String(idMap[Number(row.partyId)])
          : "independent",
    }))
  );
  const removedSlates: ObjectId[] = [];
  const removedCandidates: ObjectId[] = [];
  const slateOps: AnyBulkWriteOperation<RecruitmentSlate>[] = [];
  const candidateOps: AnyBulkWriteOperation<SlateCandidate>[] = [];
  for (const group of groups) {
    const originals = group.map((row) => byId.get(row.id)!);
    const canonical = originals[0];
    const target = group[0];
    removedSlates.push(...originals.slice(1).map((row) => row._id));
    const ids = new Set(group.map((row) => row.id));
    const mergedNotes = originals
      .map((row) =>
        originals.length > 1
          ? `Previous party ${row.partyId}, slate ${String(row._id)}${row.notes ? `: ${row.notes}` : ""}`
          : row.notes
      )
      .filter(Boolean)
      .join("\n");
    const priorities = ["high", "defend", "primary_threat", "none"] as const;
    slateOps.push({
      updateOne: {
        filter: { _id: canonical._id },
        update: {
          $set: {
            partyId: target.partyId,
            priority:
              priorities.find((priority) => originals.some((row) => row.priority === priority)) ??
              "none",
            archivedAt: originals.some((row) => row.archivedAt == null)
              ? null
              : canonical.archivedAt,
            ...(mergedNotes ? { notes: mergedNotes } : {}),
            updatedAt: now,
          },
        },
      },
    });
    const members = candidateRows
      .filter((row) => ids.has(String(row.slateId)))
      .map((row) => ({
        ...row,
        id: String(row._id),
        candidateId: String(row.candidateId),
      }));
    for (const duplicateGroup of groupSlateCandidates(members)) {
      const keeper = duplicateGroup[0];
      removedCandidates.push(...duplicateGroup.slice(1).map((row) => row._id));
      const notes = duplicateGroup
        .map((row) =>
          duplicateGroup.length > 1
            ? `Previous party ${byId.get(String(row.slateId))!.partyId}, status ${row.status}${row.invitationNote ? `: ${row.invitationNote}` : ""}`
            : row.invitationNote
        )
        .filter(Boolean)
        .join("\n");
      candidateOps.push({
        updateOne: {
          filter: { _id: keeper._id },
          update: {
            $set: {
              slateId: canonical._id,
              countryId: canonical.countryId,
              partyId: target.partyId,
              ...(notes ? { invitationNote: notes } : {}),
              updatedAt: now,
            },
          },
        },
      });
    }
  }
  // Vacate keys first: even a one-to-one renumbering can otherwise collide
  // transiently with a row which has not yet been remapped.
  await slates.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { partyId: `conversion:${String(row._id)}` } },
      },
    }))
  );
  if (removedCandidates.length) await candidates.deleteMany({ _id: { $in: removedCandidates } });
  if (candidateOps.length) await candidates.bulkWrite(candidateOps);
  if (removedSlates.length) await slates.deleteMany({ _id: { $in: removedSlates } });
  await slates.bulkWrite(slateOps);
}
