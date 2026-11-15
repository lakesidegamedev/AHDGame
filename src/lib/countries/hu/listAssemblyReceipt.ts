/**
 * Hungarian party-list replacements use the current Assembly's frozen slate.
 * Earlier386-seat and authorized199-seat receipts share the same vacancy
 * contract; completed legacy modern settlements never reuse an older slate.
 */
import type { ClientSession, Collection, Db } from "mongodb";
import { HU_1991_COUNTS_COLLECTION, type Hu1991AssemblyRecord } from "./assemblyCount1991";
import { HU_2011_COUNTS_COLLECTION } from "./assemblyCount2011";
import type { HuListNominations } from "./rules/listVacancies1991";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { hu1991AssemblyCountsCollection } from "@/lib/db/repositories/hu1991AssemblyCounts";
import { hu2011AssemblyCountsCollection } from "@/lib/db/repositories/hu2011AssemblyCounts";
export type HuListAssemblyReceipt = Pick<
  Hu1991AssemblyRecord,
  | "_id"
  | "cycle"
  | "settled"
  | "nominees"
  | "seatedAt"
  | "seatedAtTurn"
  | "listReplacementGeneration"
> & { nominations: HuListNominations };

export function huListParentCollection(
  db: Db,
  receiptId: string
): Collection<HuListAssemblyReceipt> {
  if (receiptId.startsWith("HU:mixed2011:"))
    return hu2011AssemblyCountsCollection<HuListAssemblyReceipt>(db);
  if (receiptId.startsWith("HU:mixed1989:"))
    return hu1991AssemblyCountsCollection<HuListAssemblyReceipt>(db);
  throw new Error("Unknown Hungarian list parent receipt");
}
export async function readHuListAssemblyReceipt(db: Db, session?: ClientSession) {
  const game = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      session,
      projection: { preset: 1, huAssemblyReformedAtYear: 1 },
    }
  );
  if (game?.preset !== "1991-default") return null;
  const collection =
    game.huAssemblyReformedAtYear != null ? HU_2011_COUNTS_COLLECTION : HU_1991_COUNTS_COLLECTION;
  const parent = await db.collection<HuListAssemblyReceipt>(collection).findOne(
    { seatedAtTurn: { $exists: true } },
    {
      session,
      sort: { seatedAtTurn: -1 },
      projection: {
        nominations: 1,
        settled: 1,
        nominees: 1,
        seatedAt: 1,
        seatedAtTurn: 1,
        cycle: 1,
        listReplacementGeneration: 1,
      },
    }
  );
  if (parent?._id.startsWith("HU:mixed2011:") && !Array.isArray(parent.nominations.national)) {
    // Earlier modern receipts already froze the full original person slate.
    // Reading its stored order adds no nominee and does not rewrite certification.
    const parties = new Set(
      [...(parent.settled?.mandates ?? []), ...(parent.settled?.vacancies ?? [])]
        .filter((row) => row.tier === "national")
        .map((row) => row.partyId)
        .filter((id): id is string => id !== null)
    );
    parent.nominations = {
      people: parent.nominations.people,
      territorial: [],
      national: [...parties].map((partyId) => ({
        partyId,
        candidateIds: parent.nominations.people
          .filter((row) => row.partyId === partyId)
          .map((row) => row.id),
      })),
    };
  }
  return parent;
}
