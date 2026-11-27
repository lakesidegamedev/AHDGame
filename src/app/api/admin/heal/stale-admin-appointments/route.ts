import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { getOfficeTypeConfig, type CountryId } from "@/lib/constants/countries";
/**
 * POST /api/admin/heal/stale-admin-appointments
 *
 * Removes admin-appointed officials that should have been replaced by
 * election winners but were never cleaned up.
 *
 * Duplicates are identified by seat key (officeType + state +
 * senateClass/district). Among duplicates, prefer filled records
 * (characterId or nppId) over vacant, then the most recent by electedAt
 * then updatedAt.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import type { ElectedOfficial } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";

interface DuplicateSeat {
  seatKey: string;
  officeType: string;
  state?: string;
  senateClass?: number;
  district?: number;
  records: Array<{
    id: string;
    characterName: string | null;
    isNPP: boolean;
    isFilled: boolean;
    electedAt: Date | null;
    updatedAt: Date;
    isKept: boolean;
  }>;
}

function getSeatKey(official: ElectedOfficial): string {
  const countryId = official.countryId ?? "US";
  const parts = [countryId, official.officeType];
  if (official.state) parts.push(official.state);
  if (official.senateClass != null) parts.push(`class${official.senateClass}`);
  if (official.chamberClass != null) parts.push(`chamberClass${official.chamberClass}`);
  if (official.district != null) parts.push(`district${official.district}`);
  if (official.constituencyId || official.constituency)
    parts.push(official.constituencyId ?? official.constituency!);
  if (official.seatSource) parts.push(official.seatSource);
  const mandate = official.hungarianAssemblyMandate ?? official.bulgarianFoundingMandate;
  if (mandate) parts.push(mandate.personId);
  const config = getOfficeTypeConfig(countryId as CountryId, official.officeType);
  // Aggregated and unlocated legislative rows are not proof of a duplicate seat.
  if (
    (!config?.isExecutive &&
      official.senateClass == null &&
      official.district == null &&
      !official.constituencyId &&
      !official.constituency) ||
    (official.seatsHeld ?? 1) > 1
  )
    parts.push(String(official._id));
  return parts.join(":");
}

function isFilled(official: ElectedOfficial): boolean {
  return official.characterId != null || official.nppId != null;
}

/**
 * Sort officials to determine which to keep:
 * 1. Filled records before vacant records
 * 2. Among same fill status, most recent electedAt first
 * 3. Then most recent updatedAt
 */
function sortOfficials(a: ElectedOfficial, b: ElectedOfficial): number {
  // Filled records come first
  const aFilled = isFilled(a) ? 1 : 0;
  const bFilled = isFilled(b) ? 1 : 0;
  if (bFilled !== aFilled) return bFilled - aFilled;

  // Then by electedAt (most recent first)
  const aElected = a.electedAt?.getTime() ?? 0;
  const bElected = b.electedAt?.getTime() ?? 0;
  if (bElected !== aElected) return bElected - aElected;

  // Then by updatedAt
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();

    // Get all officials
    const officials = await electedOfficialsCollection(db).find({}).toArray();

    // Group by seat key
    const bySeat = new Map<string, ElectedOfficial[]>();
    for (const official of officials) {
      const key = getSeatKey(official);
      const list = bySeat.get(key) ?? [];
      list.push(official);
      bySeat.set(key, list);
    }

    // Find seats with duplicates
    const duplicates: DuplicateSeat[] = [];
    let totalStale = 0;

    for (const [seatKey, records] of bySeat.entries()) {
      if (records.length <= 1) continue;

      // Sort to determine which to keep
      const sorted = [...records].sort(sortOfficials);

      // The first one is kept, the rest are stale
      const staleCount = sorted.length - 1;
      totalStale += staleCount;

      duplicates.push({
        seatKey,
        officeType: sorted[0].officeType,
        state: sorted[0].state,
        senateClass: sorted[0].senateClass,
        district: sorted[0].district,
        records: sorted.map((r, i) => ({
          id: r._id.toString(),
          characterName: r.characterName ?? null,
          isNPP: r.isNPP ?? false,
          isFilled: isFilled(r),
          electedAt: r.electedAt ?? null,
          updatedAt: r.updatedAt,
          isKept: i === 0,
        })),
      });
    }

    return NextResponse.json({
      status: duplicates.length > 0 ? "needs_fix" : "ok",
      message:
        duplicates.length > 0
          ? `Found ${duplicates.length} seat(s) with ${totalStale} stale record(s).`
          : "No duplicate officials found.",
      totalOfficials: officials.length,
      duplicateSeats: duplicates.length,
      staleRecords: totalStale,
      duplicates,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    return await withAtomicEconomicCommand(db, async (db) => {
      const now = new Date();

      // Get all officials
      const officials = await electedOfficialsCollection(db).find({}).toArray();

      // Group by seat key
      const bySeat = new Map<string, ElectedOfficial[]>();
      for (const official of officials) {
        const key = getSeatKey(official);
        const list = bySeat.get(key) ?? [];
        list.push(official);
        bySeat.set(key, list);
      }

      let removedCount = 0;
      let clearedCharacters = 0;
      let clearedNPPs = 0;
      const removedNames: string[] = [];

      const stale = [...bySeat.values()].flatMap((records) =>
        records.length > 1 ? [...records].sort(sortOfficials).slice(1) : []
      );
      const staleIds = new Set(stale.map((official) => String(official._id)));
      const actorKey = (official: ElectedOfficial) =>
        official.nppId || official.isNPP
          ? `npp:${official.nppId ?? official.characterId}`
          : `character:${official.characterId}`;
      const retainedActors = new Set(
        officials.filter((official) => !staleIds.has(String(official._id))).map(actorKey)
      );
      const characterIds = stale
        .filter((official) => !official.isNPP && !official.nppId && official.characterId)
        .map((official) => official.characterId!);
      const nppIds = stale.flatMap((official) =>
        official.nppId
          ? [official.nppId]
          : official.isNPP && official.characterId
            ? [official.characterId]
            : []
      );
      const [characters, npps] = await Promise.all([
        characterIds.length
          ? charactersCollection(db)
              .find(
                { _id: { $in: characterIds } },
                { projection: { countryId: 1, currentOffice: 1 } }
              )
              .toArray()
          : [],
        nppIds.length
          ? nppsCollection(db)
              .find({ _id: { $in: nppIds } }, { projection: { countryId: 1, currentOffice: 1 } })
              .toArray()
          : [],
      ]);
      const charById = new Map(characters.map((person) => [String(person._id), person]));
      const nppById = new Map(npps.map((person) => [String(person._id), person]));
      const characterOps = [],
        nppOps = [];
      for (const official of stale) {
        const key = actorKey(official);
        const isNpp = !!(official.nppId || official.isNPP);
        const person = isNpp
          ? nppById.get(String(official.nppId ?? official.characterId))
          : charById.get(String(official.characterId));
        const office = person?.currentOffice;
        const mirrorsThisSeat =
          office?.type === official.officeType &&
          (person?.countryId ?? "US") === (official.countryId ?? "US") &&
          (!official.state || ("state" in office && office.state === official.state)) &&
          (official.senateClass == null ||
            ("senateClass" in office && office.senateClass === official.senateClass));
        if (person && mirrorsThisSeat && !retainedActors.has(key)) {
          const operation = {
            updateOne: {
              filter: { _id: person._id, currentOffice: office },
              update: { $set: { currentOffice: null, updatedAt: now } },
            },
          };
          if (isNpp) nppOps.push(operation);
          else characterOps.push(operation);
        }
        removedNames.push(
          `${official.characterName ?? "Vacant"} (${official.countryId ?? "US"} ${official.officeType}${official.state ? ` - ${official.state}` : ""})`
        );
      }
      if (characterOps.length)
        clearedCharacters = (await charactersCollection(db).bulkWrite(characterOps)).modifiedCount;
      if (nppOps.length) clearedNPPs = (await nppsCollection(db).bulkWrite(nppOps)).modifiedCount;
      if (stale.length) {
        removedCount = (
          await electedOfficialsCollection(db).deleteMany({
            _id: { $in: stale.map((official) => official._id) },
          })
        ).deletedCount;
        if (removedCount !== stale.length) throw new Error("Official seats changed during repair");
      }

      return NextResponse.json({
        success: true,
        removedCount,
        clearedCharacters,
        clearedNPPs,
        removedNames: removedNames.slice(0, 50), // Limit output size
        message: `Removed ${removedCount} stale official record(s). Cleared currentOffice from ${clearedCharacters} character(s) and ${clearedNPPs} NPP(s).`,
      });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
