import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
/**
 * Move every political party from one country to another, renumbering them and
 * rewriting every reference.
 *
 * WHY THIS EXISTS AT ALL. `regionScopedCollections` deliberately refuses to move
 * `politicalParties`, because its case is Northern Ireland leaving the UK, where
 * the source survives and its national parties must not be disturbed. A
 * DISSOLVING source inverts that: there is no country left to protect, and its
 * parties are the losing side's whole political identity.
 *
 * WHY RENUMBERING IS NOT OPTIONAL. `characters.party` and `electedOfficials.party`
 * hold a stringified PER-COUNTRY `sequentialId`, not a party id. DD's "1" is the
 * SED; DE's "1" is the SPD. Moving the docs without renumbering, or renumbering
 * without rewriting the references, silently reinterprets every member of every
 * party against the target's list. `politicalParties` also carries a unique index
 * on `{countryId, sequentialId}`, so a colliding id would throw on write anyway --
 * the index is a backstop for the data corruption, not the reason for it.
 *
 * Spec: docs/superpowers/specs/2026-08-29-reunification-merge-design.md
 */
import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { PoliticalParty } from "@/lib/db/types";
import { reserveSequentialIds, realignPartyCountersToExisting } from "@/lib/db/sequentialId";
import { resolveMergeFxScale } from "./mergeFxScale";
import {
  PARTY_REF_COLLECTIONS,
  PARTY_KEYED_MAP_COLLECTIONS,
  PARTY_KEYED_DOCUMENT_ID_COLLECTIONS,
  PARTY_OBJECTID_COLLECTIONS,
  NON_PARTY_SENTINELS,
  buildPartyIdMap,
} from "./partyMigrationCollections";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import type { Document } from "mongodb";

export interface MergePartiesArgs {
  fromCountryId: CountryId;
  toCountryId: CountryId;
  currentTurn: number;
}

export interface MergePartiesResult {
  ok: boolean;
  error?: string;
  /** old sequentialId (as string) to new sequentialId (as string). */
  partyIdMap: Record<string, string>;
  partiesMoved: number;
  documentsRemapped: number;
}

/** A party doc plus the stamp this migration writes onto it. */
type PartyDoc = Pick<PoliticalParty, "_id" | "sequentialId"> & {
  mergedFrom?: { countryId: string; sequentialId: number; turn?: number };
};

async function mergePartiesIntoCountryAtomic(
  db: Db,
  args: MergePartiesArgs
): Promise<MergePartiesResult> {
  return withAtomicResult(db, (tx) =>
    withTurnValueSettlement(
      tx,
      "country-party-merge",
      args.currentTurn,
      (inner) => mergePartiesIntoCountry(inner, args),
      { sourceKey: `${args.fromCountryId}:${args.toCountryId}` }
    )
  );
}
async function mergePartiesIntoCountry(
  db: Db,
  args: MergePartiesArgs
): Promise<MergePartiesResult> {
  const { fromCountryId, toCountryId, currentTurn } = args;
  const empty: MergePartiesResult = {
    ok: true,
    partyIdMap: {},
    partiesMoved: 0,
    documentsRemapped: 0,
  };

  if (fromCountryId === toCountryId) {
    return { ...empty, ok: false, error: "A country cannot absorb its own parties." };
  }

  const parties = await politicalPartiesCollection(db)
    .find<PartyDoc>({ countryId: fromCountryId })
    .toArray();

  const alreadyMoved = await politicalPartiesCollection(db)
    .find<PartyDoc>({ countryId: toCountryId, "mergedFrom.countryId": fromCountryId })
    .toArray();
  if (!parties.length && !alreadyMoved.length) return empty;
  const newIds = parties.length
    ? await reserveSequentialIds(db, "party", parties.length, toCountryId)
    : [];
  const moved = [
    ...alreadyMoved
      .filter((p) => p.mergedFrom?.countryId === fromCountryId)
      .map((p) => ({
        doc: p,
        oldSequentialId: p.mergedFrom!.sequentialId,
        newSequentialId: p.sequentialId,
      })),
    ...parties.map((p, i) => ({
      doc: p,
      oldSequentialId: p.sequentialId,
      newSequentialId: newIds[i],
    })),
  ];
  const partyIdMap = buildPartyIdMap(moved);
  const now = new Date();

  // The party documents first. `mergedFrom` is the idempotency stamp: a re-run
  // reads it back off the target country and rebuilds the same map without
  // reserving a second block of ids.
  const partyWrites = moved
    .filter((m) => parties.some((p) => p._id.equals(m.doc._id)))
    .map((m) => ({
      updateOne: {
        filter: { _id: m.doc._id },
        update: {
          $set: {
            countryId: toCountryId,
            sequentialId: m.newSequentialId,
            mergedFrom: {
              countryId: fromCountryId,
              sequentialId: m.oldSequentialId,
              turn: currentTurn,
            },
            updatedAt: now,
          },
        },
      },
    }));
  if (partyWrites.length) await politicalPartiesCollection(db).bulkWrite(partyWrites);

  let documentsRemapped = 0;

  // One updateMany per (collection, field, old id). Never a per-document loop:
  // `orgRegLedger` and `partyPoliticalStrengthLedger` hold thousands of rows for a
  // single country, and this runs inside a turn phase with a time budget.
  //
  // Filtered on the SOURCE country so a target-country row that happens to share
  // the old numeric value is never touched. That filter is the whole safety
  // property of this function.
  for (const ref of PARTY_REF_COLLECTIONS) {
    // `countryKey` because not every collection carries a `countryId`: a
    // one-doc-per-country row is keyed by the country id itself, and filtering
    // such a collection on `countryId` matches nothing and reports no error.
    const countryKey = ref.countryKey ?? "countryId";
    const entries = Object.entries(partyIdMap).filter(([oldId]) => !NON_PARTY_SENTINELS.has(oldId));
    if (!entries.length) continue;
    const res = await updatePartyReferenceRows(
      db.collection(ref.collection),
      { [countryKey]: fromCountryId, [ref.field]: { $in: entries.map(([oldId]) => oldId) } },
      [
        {
          $set: {
            [ref.field]: entries.reduceRight<unknown>(
              (otherwise, [oldId, newId]) => ({
                $cond: [{ $eq: [`$${ref.field}`, oldId] }, newId, otherwise],
              }),
              `$${ref.field}`
            ),
            updatedAt: now,
          },
        },
      ]
    );
    documentsRemapped += res.modifiedCount;
  }

  // Maps whose KEYS are party ids. `$set` on a path rewrites a value and cannot
  // rename a key, so these are read, rebuilt and written back whole — and two old
  // keys landing on one new key SUM rather than one of them quietly winning.
  for (const ref of PARTY_KEYED_MAP_COLLECTIONS) {
    const countryKey = ref.countryKey ?? "countryId";
    const docs = await db
      .collection(ref.collection)
      .find({ [countryKey]: fromCountryId } as Record<string, unknown>)
      .toArray();
    const keyMapWrites: import("mongodb").AnyBulkWriteOperation<PartyReferenceDocument>[] = [];
    for (const doc of docs) {
      const current = (doc as Record<string, unknown>)[ref.field] as
        Record<string, number> | undefined;
      if (!current) continue;
      const rebuilt: Record<string, number> = {};
      let changed = false;
      for (const [key, value] of Object.entries(current)) {
        const mapped = NON_PARTY_SENTINELS.has(key) ? key : (partyIdMap[key] ?? key);
        if (mapped !== key) changed = true;
        rebuilt[mapped] = (rebuilt[mapped] ?? 0) + value;
      }
      if (!changed) continue;
      keyMapWrites.push({
        updateOne: {
          filter: { _id: doc._id } as Record<string, unknown>,
          update: { $set: { [ref.field]: rebuilt, updatedAt: now } },
        },
      });
      documentsRemapped += 1;
    }
    await applyPartyReferenceWrites(
      db.collection<PartyReferenceDocument>(ref.collection),
      keyMapWrites
    );
  }

  // Collections whose DOCUMENT `_id` embeds the sequentialId. The field updates
  // above already ran, so these rows now disagree with their own key, and a
  // `_id` cannot be updated — they must be re-keyed.
  //
  // TWO PHASES, because the remap is a PERMUTATION: on a reunification the row
  // keyed `NW_1` becomes `NW_6` while `NW_7` becomes `NW_1`, so a direct pass
  // collides on a key the same run is about to vacate. Everything is parked
  // under a temporary id first, then landed.
  //
  // A row is only moved when its target is free or is itself being vacated. A
  // target held by a row that is staying put is a real collision and is left
  // alone rather than overwritten: losing one party's organisation silently is
  // worse than a key that still disagrees, which `verify` can find later.
  for (const ref of PARTY_KEYED_DOCUMENT_ID_COLLECTIONS) {
    const coll = db.collection<PartyReferenceDocument>(ref.collection);
    const rows = (await coll
      .find({ countryId: toCountryId } as Record<string, unknown>)
      .toArray()) as Array<Record<string, unknown>>;

    const keyFor = (row: Record<string, unknown>) =>
      ref.idParts.map((part) => String(row[part])).join("_");

    const misKeyed = rows.filter((row) => String(row._id) !== keyFor(row));
    if (misKeyed.length === 0) continue;

    const present = new Set(rows.map((row) => String(row._id)));
    const vacating = new Set(misKeyed.map((row) => String(row._id)));
    const claimed = new Set<string>();
    const movable = misKeyed.filter((row) => {
      const target = keyFor(row);
      if (claimed.has(target)) return false;
      if (present.has(target) && !vacating.has(target)) return false;
      claimed.add(target);
      return true;
    });

    const parked = movable.map((row) => {
      const { _id, ...doc } = row;
      return { oldId: _id, tempId: `__rekey__${String(_id)}`, finalId: keyFor(row), doc };
    });
    await replacePartyDocumentKeys(coll, parked);
    documentsRemapped += parked.length;
  }

  // The one collection keyed by ObjectId rather than sequentialId. Its rows only
  // need re-scoping, because the party's `_id` does not change when it moves.
  for (const ref of PARTY_OBJECTID_COLLECTIONS) {
    const res = await updatePartyReferenceRows(
      db.collection(ref.collection),
      {
        countryId: fromCountryId,
        [ref.field]: { $in: moved.map((p) => p.doc._id as ObjectId) },
      },
      { $set: { countryId: toCountryId, updatedAt: now } }
    );
    documentsRemapped += res?.modifiedCount ?? 0;
  }

  // The target's counter must end at max(sequentialId) or the next party founded
  // there reuses an id behind the unique index.
  await realignPartyCountersToExisting(db);

  // The moved parties' money is still denominated in the DISSOLVED country's
  // currency. Characters and corporations convert with their regions
  // (`convertTransferredResidentsCurrency`); the national party treasuries live
  // on `politicalParties.treasury` and cross here, at the same merge FX scale.
  await convertMovedPartyTreasuries(db, fromCountryId, toCountryId);

  return {
    ok: true,
    partyIdMap,
    partiesMoved: parties.length,
    documentsRemapped,
  };
}

/**
 * FX-convert the treasuries of parties this merge moved, exactly once.
 *
 * The `mergedFrom.treasuryConverted` stamp travels inside the same atomic
 * update as the `$mul`, and the `$ne: true` filter makes a concurrent or
 * repeated pass match nothing — a treasury can be scaled once or zero times,
 * never twice. Stamped even at scale 1 (same currency / forex off) so a later
 * re-run cannot re-convert after a rate appears.
 */
async function convertMovedPartyTreasuries(
  db: Db,
  fromCountryId: CountryId,
  toCountryId: CountryId
): Promise<void> {
  const scale = await resolveMergeFxScale(db, fromCountryId, toCountryId);
  const filter = {
    countryId: toCountryId,
    "mergedFrom.countryId": fromCountryId,
    "mergedFrom.treasuryConverted": { $ne: true },
  };
  const stamp = { "mergedFrom.treasuryConverted": true, updatedAt: new Date() };
  if (scale === 1) {
    await updatePartyReferenceRows(politicalPartiesCollection<Document>(db), filter, {
      $set: stamp,
    });
    return;
  }
  await updatePartyReferenceRows(politicalPartiesCollection<Document>(db), filter, {
    $mul: { treasury: scale },
    $set: stamp,
  });
}

export { mergePartiesIntoCountryAtomic as mergePartiesIntoCountry };

type PartyReferenceDocument = Record<string, unknown> & { _id: string | ObjectId };
async function applyPartyReferenceWrites(
  collection: import("mongodb").Collection<PartyReferenceDocument>,
  operations: import("mongodb").AnyBulkWriteOperation<PartyReferenceDocument>[]
) {
  if (operations.length) await collection.bulkWrite(operations);
}
async function replacePartyDocumentKeys(
  collection: import("mongodb").Collection<PartyReferenceDocument>,
  rows: Array<{ oldId: unknown; tempId: string; finalId: string; doc: Record<string, unknown> }>
) {
  if (!rows.length) return;
  await collection.bulkWrite(
    rows.flatMap((row) => [
      { insertOne: { document: { ...row.doc, _id: row.tempId } } },
      { deleteOne: { filter: { _id: row.oldId as string | ObjectId } } },
    ])
  );
  await collection.bulkWrite(
    rows.flatMap((row) => [
      { insertOne: { document: { ...row.doc, _id: row.finalId } } },
      { deleteOne: { filter: { _id: row.tempId } } },
    ])
  );
}

async function updatePartyReferenceRows<T extends import("mongodb").Document>(
  collection: import("mongodb").Collection<T>,
  filter: Parameters<typeof collection.updateMany>[0],
  update: Parameters<typeof collection.updateMany>[1]
) {
  return collection.updateMany(filter, update);
}
