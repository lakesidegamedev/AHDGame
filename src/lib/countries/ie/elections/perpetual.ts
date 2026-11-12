import { ensureRegionalGovernorElections } from "@/lib/elections/scheduling/shared";
import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import { IE_DAIL_SPEC, IE_LOCAL_COUNCIL_SPEC, IE_UACHTARAN_SPEC } from "./chamberSpecs";

/** Dáil Éireann, one multi-seat constituency election per region. */
export async function ensureIEElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(IE_DAIL_SPEC, now, inFlightTurn);
}

/** Uachtarán na hÉireann, one nationwide seat. */
export async function ensureIEUachtaranElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(IE_UACHTARAN_SPEC, now, inFlightTurn);
}

/** Local councils, one per region on the five-year cycle. */
export async function ensureIELocalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(IE_LOCAL_COUNCIL_SPEC, now, inFlightTurn);
}

/**
 * Spawn perpetual Cathaoirleach elections for all 8 IE regions on the
 * shared cross-country `governor` cycle (4-year canonical anchor). Single-
 * seat per region. Display label varies per region via
 * `getRegionalExecutive` (Lord Mayor of Dublin/Cork, Mayor of Limerick/
 * Galway, Cathaoirleach elsewhere) — see regionalExecutive.ts.
 */
export async function ensureIECathaoirleachElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureRegionalGovernorElections("IE", now, undefined, inFlightTurn);
}
