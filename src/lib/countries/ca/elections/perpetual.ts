import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import { ensureRegionalGovernorElections } from "@/lib/elections/scheduling/shared";
import { CA_COMMONS_SPEC } from "./chamberSpecs";

/** House of Commons: one regional contest per province or territory. */
export async function ensureCAElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(CA_COMMONS_SPEC, now, inFlightTurn);
}

/**
 * Premier elections for all 13 regions on the shared cross-country `governor`
 * cycle. Single seat per region.
 */
export async function ensureCAPremierElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalGovernorElections("CA", now, undefined, inFlightTurn);
}
