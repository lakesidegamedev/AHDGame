/**
 * Test builders for NPP candidate markets and the demand signal that sizes them.
 * A candidate is a (region, lane) bucket; its room comes from unmet demand, not
 * from a stored document.
 */
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { bucketKey } from "@/lib/market/marketBuckets";
import type { MarketCandidate } from "@/lib/turn/npp/marketCandidates";
import type { PlacementSignals } from "@/lib/turn/npp/marketSignals";

type CandidateOverrides = Partial<
  Pick<
    MarketCandidate,
    "stateId" | "countryId" | "sectorType" | "industryModel" | "mediaDiscriminator"
  >
>;

/** One candidate bucket; defaults to manufacturing in CA, US. */
export function candidate(overrides: CandidateOverrides = {}): MarketCandidate {
  const stateId = overrides.stateId ?? "CA";
  const countryId = overrides.countryId ?? "US";
  const sectorType = overrides.sectorType ?? "manufacturing";
  const industryModel = overrides.industryModel ?? null;
  const mediaDiscriminator = overrides.mediaDiscriminator ?? null;
  return {
    lane: getOperatingSectorType(sectorType, industryModel, mediaDiscriminator),
    sectorType,
    industryModel,
    mediaDiscriminator,
    stateId,
    countryId,
    key: bucketKey(stateId, sectorType, industryModel, mediaDiscriminator),
  } as MarketCandidate;
}

/** Candidates grouped the way the shell hands them to the brain. */
export function candidatesByCountry(
  list: readonly MarketCandidate[]
): Map<string, MarketCandidate[]> {
  const byCountry = new Map<string, MarketCandidate[]>();
  for (const c of list) {
    const bucket = byCountry.get(c.countryId);
    if (bucket) bucket.push(c);
    else byCountry.set(c.countryId, [c]);
  }
  return byCountry;
}

/**
 * Placement signals whose unmet demand is the given units per bucket. A bucket
 * not listed has no unmet demand. Claims made through `claimDemandUnits` reduce
 * the room later reads see, as the shell's ledger does.
 */
export function demandSignals(
  unmetByBucket: ReadonlyMap<string, number> | Record<string, number>,
  base: PlacementSignals = {}
): PlacementSignals {
  const room = new Map<string, number>(
    unmetByBucket instanceof Map ? unmetByBucket : Object.entries(unmetByBucket)
  );
  return {
    ...base,
    unmetDemandUnitsOf: (cell) =>
      Math.max(
        0,
        room.get(
          bucketKey(cell.stateId, cell.sectorType, cell.industryModel, cell.mediaDiscriminator)
        ) ?? 0
      ),
    claimDemandUnits: (cell, units) => {
      const key = bucketKey(
        cell.stateId,
        cell.sectorType,
        cell.industryModel,
        cell.mediaDiscriminator
      );
      room.set(key, Math.max(0, (room.get(key) ?? 0) - units));
    },
  };
}

const roomByCandidate = new WeakMap<object, number>();

/** A candidate bucket with a fixed amount of room (unmet demand units). */
export function candidateWithRoom(overrides: CandidateOverrides, room: number): MarketCandidate {
  const built = candidate(overrides);
  roomByCandidate.set(built, room);
  return built;
}

/** Room registered for a candidate by `candidateWithRoom`; 0 when unregistered. */
export function roomOf(cell: object): number {
  return roomByCandidate.get(cell) ?? 0;
}

/**
 * Signals that read each registered candidate's room as its unmet demand.
 * Signals that already carry their own demand reading are returned unchanged.
 */
export function withCandidateRoom(signals?: PlacementSignals): PlacementSignals {
  if (signals?.unmetDemandUnitsOf) return signals;
  return { ...signals, unmetDemandUnitsOf: (cell) => roomOf(cell) };
}

/** Signals that read the same unmet demand in every bucket. */
export function uniformDemandSignals(units: number, base: PlacementSignals = {}): PlacementSignals {
  return { ...base, unmetDemandUnitsOf: () => units };
}
