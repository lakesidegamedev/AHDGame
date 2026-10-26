import { ObjectId, type Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { TurnReferenceData } from "@/lib/corporations/turnReferenceData";
import {
  buildSectorPresenceKeys,
  tariffRulesNeedSectorPresenceKeys,
} from "@/lib/tariffs/tariffEffects";
import { buildFtaCoverageLookup, type FtaCoverage } from "@/lib/tariffs/ftaOverrides";

type SectorMirrorRow = Pick<
  CorporateSector,
  "corporationId" | "countryId" | "sectorType" | "revenue"
>;

interface SectorMirror {
  allSectorsRaw: CorporateSector[];
  corpByIdForTariffs: Map<string, Pick<Corporation, "_id" | "countryId">>;
}

// Every corporation page used to read every sector and the home country of
// every owning corporation, about 14k rows, to build tariff and FTA exposure.
// Those fields only move with the turn, so share one load per turn across
// requests. The TTL bounds staleness for sectors founded between turns.
const MIRROR_TTL_MS = 5 * 60_000;
const mirrorCache = new WeakMap<
  Db,
  { turn: number; loadedAt: number; promise: Promise<SectorMirror> }
>();

function getSectorMirror(db: Db, currentTurn: number): Promise<SectorMirror> {
  const now = Date.now();
  const cached = mirrorCache.get(db);
  if (cached && cached.turn === currentTurn && now - cached.loadedAt < MIRROR_TTL_MS) {
    return cached.promise;
  }
  const promise = loadSectorMirror(db).catch((err) => {
    if (mirrorCache.get(db)?.promise === promise) mirrorCache.delete(db);
    throw err;
  });
  mirrorCache.set(db, { turn: currentTurn, loadedAt: now, promise });
  return promise;
}

async function loadSectorMirror(db: Db): Promise<SectorMirror> {
  const rows = await db
    .collection<CorporateSector>("corporateSectors")
    .find({}, { projection: { corporationId: 1, countryId: 1, sectorType: 1, revenue: 1 } })
    .toArray();
  const allSectorsRaw = rows as SectorMirrorRow[] as CorporateSector[];
  const sectorLookupCorpIds = [...new Set(allSectorsRaw.map((s) => s.corporationId.toString()))];
  const sectorLookupCorps =
    sectorLookupCorpIds.length > 0
      ? await db
          .collection<Corporation>("corporations")
          .find(
            { _id: { $in: sectorLookupCorpIds.map((cid) => new ObjectId(cid)) } },
            { projection: { _id: 1, countryId: 1 } }
          )
          .toArray()
      : [];
  const corpByIdForTariffs = new Map(sectorLookupCorps.map((corp) => [corp._id.toString(), corp]));
  return { allSectorsRaw, corpByIdForTariffs };
}

export interface ReferenceSectorsResult {
  refData: TurnReferenceData;
  sectors: CorporateSector[];
  allSectorsRaw: CorporateSector[];
  corpByIdForTariffs: Map<string, Pick<Corporation, "_id" | "countryId">>;
  blendPresenceKeys: Set<string>;
  ftaCoverage: FtaCoverage;
}

/**
 * Reference-data + sector loads for the corporation detail view (#587).
 *
 * Awaits the already-initiated turn-reference promise alongside this corp's
 * own sectors and the all-sector tariff mirror, then builds the tariff
 * sector-presence inputs from the same raw rows the view always used.
 * `refDataPromise` is created by the caller before the share-invariant reads
 * so those round trips overlap, exactly as before. The all-sector mirror is
 * shared per turn (see getSectorMirror).
 */
export async function loadReferenceSectors(
  db: Db,
  corporation: Corporation,
  refDataPromise: Promise<TurnReferenceData>,
  currentTurn: number
): Promise<ReferenceSectorsResult> {
  const [refData, sectors, { allSectorsRaw, corpByIdForTariffs }] = await Promise.all([
    refDataPromise,
    db
      .collection<CorporateSector>("corporateSectors")
      .find({ corporationId: corporation._id })
      .toArray(),
    getSectorMirror(db, currentTurn),
  ]);
  const { allTariffs, activeFtaPairs } = refData;

  const blendPresenceKeys = tariffRulesNeedSectorPresenceKeys(allTariffs)
    ? buildSectorPresenceKeys(allSectorsRaw, corpByIdForTariffs)
    : new Set<string>();
  const ftaCoverage = buildFtaCoverageLookup(allSectorsRaw, corpByIdForTariffs, activeFtaPairs);

  return { refData, sectors, allSectorsRaw, corpByIdForTariffs, blendPresenceKeys, ftaCoverage };
}
