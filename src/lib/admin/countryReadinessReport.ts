import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import {
  COUNTRY_READINESS_EXPECTATIONS,
  type ReadinessCheck,
} from "@/lib/constants/countryReadinessExpectations";
import { getReadinessExpectations } from "@/lib/constants/readinessExpectations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";

/** Best-effort preset lookup; null when the world has no gameState yet. */
async function readPreset(db: Db): Promise<string | null> {
  const gs = await gameStateCollection<{ preset?: string }>(db).findOne({
    _id: "current" as never,
  });
  return typeof gs?.preset === "string" ? gs.preset : null;
}

export interface CountryReadinessReport {
  ready: boolean;
  summary: { ok: number; warning: number; missing: number };
  checks: ReadinessCheck[];
}

/**
 * Generate a per-country readiness report driven by COUNTRY_READINESS_EXPECTATIONS.
 * Returns null when the country has no expectations entry (caller should 404).
 * Reads only, never writes.
 *
 * `preset` makes the expectations era-aware via `getReadinessExpectations`.
 * Region counts and party rosters differ by era (1953/1979 seed 11 Länder, 1991+
 * seed 16; rosters name era-appropriate parties), so the modern authored entry
 * would flag a correct historical seed as incomplete. Falls back to gameState's
 * preset, then to the authored entry as-is.
 */
/**
 * Total SEATS in a collection, not the number of rows holding them.
 *
 * `seats` stores one row per constituency with a `totalSeats` count, and
 * `electedOfficials` one row per (region, party) with a `seatsHeld` count.
 * Japan's 465-seat Shugiin is 8 rows in `seats` and 51 in `electedOfficials`,
 * so counting rows produces false alarms against seat expectations.
 *
 * A missing count means ONE seat, not zero: single-seat offices omit the field
 * rather than storing 1 (US senate, governors, president, Ireland's uachtaran).
 * The field is never explicitly 0, so `$ifNull` is correct and `$max` against 1
 * would be wrong.
 */
async function sumSeats(
  db: Db,
  collection: "seats" | "electedOfficials",
  countryId: CountryId,
  field: "totalSeats" | "seatsHeld"
): Promise<number> {
  const [row] = await db
    .collection(collection)
    .aggregate<{ seats: number }>([
      { $match: { countryId } },
      { $group: { _id: null, seats: { $sum: { $ifNull: [`$${field}`, 1] } } } },
    ])
    .toArray();
  return row?.seats ?? 0;
}

export async function buildCountryReadinessReport(
  db: Db,
  countryId: CountryId,
  preset?: string
): Promise<CountryReadinessReport | null> {
  const resolvedPreset = preset ?? (await readPreset(db));
  const expect = resolvedPreset
    ? getReadinessExpectations(countryId, resolvedPreset)
    : COUNTRY_READINESS_EXPECTATIONS[countryId];
  if (!expect) return null;

  const checks: ReadinessCheck[] = [];

  const expectedRegions = expect.regionCount;
  const regionCount = await statesCollection<Document>(db).countDocuments({ countryId });
  checks.push({
    name: "Regions",
    status: regionCount === expectedRegions ? "ok" : regionCount > 0 ? "warning" : "missing",
    count: regionCount,
    detail: `Expected ${expectedRegions}, found ${regionCount}`,
  });

  const partyCount = await politicalPartiesCollection<Document>(db).countDocuments({ countryId });
  checks.push({
    name: "Parties",
    status:
      partyCount >= expect.partyMin
        ? "ok"
        : partyCount > 0 || expect.partyMin === 0
          ? "warning"
          : "missing",
    count: partyCount,
    detail: `Expected ≥${expect.partyMin} (${expect.partyRoster}), found ${partyCount}`,
  });

  const orgCount = await db.collection("statePartyOrg").countDocuments({ countryId });
  checks.push({
    name: "StatePartyOrg",
    status:
      orgCount >= expect.statePartyOrgMin
        ? "ok"
        : orgCount > 0 || expect.statePartyOrgMin === 0
          ? "warning"
          : "missing",
    count: orgCount,
    detail: `Expected ≥${expect.statePartyOrgMin}, found ${orgCount}`,
  });

  const seatCount = await sumSeats(db, "seats", countryId, "totalSeats");
  checks.push({
    name: "Seats",
    status:
      seatCount >= expect.seatMin
        ? "ok"
        : seatCount > 0 || expect.seatMin === 0
          ? "warning"
          : "missing",
    count: seatCount,
    detail: `${expect.seatNote}, found ${seatCount}`,
  });

  const nppCount = await db.collection("npps").countDocuments({ countryId });
  checks.push({
    name: "NPPs",
    status:
      nppCount >= expect.nppMin
        ? "ok"
        : nppCount > 0 || expect.nppMin === 0
          ? "warning"
          : "missing",
    count: nppCount,
    detail: `${expect.nppNote}, found ${nppCount}`,
  });

  const officialCount = await sumSeats(db, "electedOfficials", countryId, "seatsHeld");
  checks.push({
    name: "ElectedOfficials",
    status:
      officialCount >= expect.officialMin
        ? "ok"
        : officialCount > 0 || expect.officialMin === 0
          ? "warning"
          : "missing",
    count: officialCount,
    detail: `Expected ≥${expect.officialMin}, found ${officialCount}`,
  });

  const expectedDemographics = expect.demographicsCount;
  const demoCount = await db.collection("stateDemographics").countDocuments({ countryId });
  checks.push({
    name: "Demographics",
    status: demoCount === expectedDemographics ? "ok" : demoCount > 0 ? "warning" : "missing",
    count: demoCount,
    detail: `Expected ${expectedDemographics}, found ${demoCount}`,
  });

  // macroMetrics, not stateMetrics: the legacy collection stopped being written
  // in step-6 Phase 3, so counting it reported EVERY country as missing its
  // region metrics. macroMetrics is where seeded region metrics live now.
  const expectedMetrics = expect.stateMetricsCount;
  const metricsCount = await db
    .collection<{ _id: string }>("macroMetrics")
    .countDocuments(expect.stateMetricsFilter);
  checks.push({
    name: "RegionMetrics",
    status: metricsCount >= expectedMetrics ? "ok" : metricsCount > 0 ? "warning" : "missing",
    count: metricsCount,
    detail: `Expected ≥${expectedMetrics}, found ${metricsCount}`,
  });

  // legislationTypes docs carry `countryScope` (lowercase id), never `countryId`.
  const legTypeCount = await db
    .collection("legislationTypes")
    .countDocuments({ countryScope: countryId.toLowerCase() });
  checks.push({
    name: "LegislationTypes",
    status:
      legTypeCount >= expect.legislationTypesMin
        ? "ok"
        : legTypeCount > 0 || expect.legislationTypesMin === 0
          ? "warning"
          : "missing",
    count: legTypeCount,
    detail: `Found ${legTypeCount} ${countryId} legislation types`,
  });

  if (expect.extras) {
    for (const extra of expect.extras) {
      checks.push(await extra(db));
    }
  }

  const ok = checks.filter((c) => c.status === "ok").length;
  const warning = checks.filter((c) => c.status === "warning").length;
  const missing = checks.filter((c) => c.status === "missing").length;
  return {
    ready: missing === 0 && warning === 0,
    summary: { ok, warning, missing },
    checks,
  };
}
