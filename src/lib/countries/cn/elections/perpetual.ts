import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import { CN_GOVERNOR_SPEC, CN_NPC_DELEGATE_SPEC, CN_PEOPLES_CONGRESS_SPEC } from "./chamberSpecs";

/** NPC delegations: one multi-seat election per region, all seats contested. */
export async function ensureCNElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(CN_NPC_DELEGATE_SPEC, now, inFlightTurn);
}

/**
 * Provincial People's Congresses, one multi-seat election per province on the
 * same five-year clock as the NPC so national and provincial votes share a turn.
 */
export async function ensureCNPeoplesCongressElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(CN_PEOPLES_CONGRESS_SPEC, now, inFlightTurn);
}

/**
 * Regional governors. Not competitive in the seeded reality, but the election
 * still runs so the seat has a normal succession path and players can stage
 * primary challenges.
 */
export async function ensureCNGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(CN_GOVERNOR_SPEC, now, inFlightTurn);
}
