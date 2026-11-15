import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import {
  NG_GOVERNOR_SPEC,
  NG_HOUSE_SPEC,
  NG_PRESIDENT_SPEC,
  NG_REGIONAL_COUNCIL_SPEC,
  NG_SENATE_SPEC,
} from "./chamberSpecs";

/** House of Representatives, one multi-seat election per geopolitical zone. */
export async function ensureNGElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(NG_HOUSE_SPEC, now, inFlightTurn);
}

/** Senate or governor elections per zone. */
export async function ensureNGZoneElections(
  now: Date,
  electionType: "senate" | "governor",
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(
    electionType === "senate" ? NG_SENATE_SPEC : NG_GOVERNOR_SPEC,
    now,
    inFlightTurn
  );
}

export async function ensureNGSenateElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureNGZoneElections(now, "senate", inFlightTurn);
}

export async function ensureNGGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureNGZoneElections(now, "governor", inFlightTurn);
}

/** State Houses of Assembly, per zone on the concurrent general cycle. */
export async function ensureNGRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(NG_REGIONAL_COUNCIL_SPEC, now, inFlightTurn);
}

/** National presidential race; the bespoke federal-character engine resolves it. */
export async function ensureNGPresidentialElection(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(NG_PRESIDENT_SPEC, now, inFlightTurn);
}
