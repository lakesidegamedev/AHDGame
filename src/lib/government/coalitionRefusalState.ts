/**
 * Shell for coalition refusals: seeds them onto the government formation
 * record and advances them once per completed lower-chamber election. The
 * rules live in `./rules/coalitionRefusals`.
 */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Election, PoliticalParty } from "@/lib/db/types";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";
import { coalitionRefusalSeedsFor } from "./coalitionRefusalSeeds";
import {
  advanceRefusalsAfterElection,
  expandRefusalSeeds,
  type CoalitionRefusal,
} from "./rules/coalitionRefusals";

/** Seats keyed by party abbreviation instead of sequential id. */
function seatsByAbbreviation(
  seatsByParty: Record<string, number>,
  parties: Array<Pick<PoliticalParty, "sequentialId" | "abbreviation">>
): Record<string, number> {
  const abbr = new Map(parties.map((p) => [String(p.sequentialId), p.abbreviation]));
  const out: Record<string, number> = {};
  for (const [id, seats] of Object.entries(seatsByParty)) {
    const key = abbr.get(id);
    if (key) out[key] = (out[key] ?? 0) + seats;
  }
  return out;
}

/**
 * Key of the latest lower-chamber election whose every contest has finished,
 * or null when none has. Multi-region chambers (the Bundestag runs one
 * contest per Land) only count once the whole cycle is in.
 */
async function latestFinishedElectionKey(
  db: Db,
  countryId: CountryId,
  preset: string | undefined
): Promise<string | null> {
  const electionType = getLowerChamberOfficeType(countryId, preset);
  const elections = db.collection<Election>("elections");
  const latest = await elections.findOne(
    { countryId, electionType, status: { $in: ["completed", "resolved"] } },
    { sort: { cycle: -1 }, projection: { cycle: 1 } }
  );
  if (!latest) return null;
  const open = await elections.countDocuments(
    { countryId, electionType, cycle: latest.cycle, status: { $in: ["upcoming", "active"] } },
    { limit: 1 }
  );
  return open > 0 ? null : `${electionType}:${latest.cycle}`;
}

/**
 * Seed and advance this country's coalition refusals, returning those in
 * force. Free for a country with nothing authored for the preset.
 */
export async function syncCoalitionRefusals(
  db: Db,
  countryId: CountryId,
  preset: string | undefined
): Promise<CoalitionRefusal[]> {
  const seeds = coalitionRefusalSeedsFor(preset, countryId);
  if (seeds.length === 0) return [];

  const govCol = getGovernmentFormationsCollection(db);
  const gov = await govCol.findOne(
    { _id: countryId },
    { projection: { seatsByParty: 1, coalitionRefusals: 1, coalitionRefusalElection: 1 } }
  );
  if (!gov) return [];

  const initialised = gov.coalitionRefusals !== undefined;
  const refusals = gov.coalitionRefusals ?? expandRefusalSeeds(seeds);
  if (initialised && refusals.length === 0) return [];

  const electionKey = await latestFinishedElectionKey(db, countryId, preset);
  const memoKey = gov.coalitionRefusalElection?.key ?? null;
  if (initialised && (electionKey === null || electionKey === memoKey)) return refusals;

  const parties = await db
    .collection<PoliticalParty>("politicalParties")
    .find({ countryId }, { projection: { sequentialId: 1, abbreviation: 1 } })
    .toArray();
  const seats = seatsByAbbreviation(gov.seatsByParty ?? {}, parties);

  let next = refusals;
  if (initialised && gov.coalitionRefusalElection && electionKey) {
    const result = advanceRefusalsAfterElection({
      refusals,
      previousSeats: gov.coalitionRefusalElection.seats,
      currentSeats: seats,
      electionKey,
      scope: countryId,
    });
    next = result.refusals;
    for (const lapse of result.lapsed) {
      console.log(
        `[coalitionRefusals] ${countryId}: ${lapse.refuser} dropped its refusal to govern with ${lapse.refused} after ${lapse.consecutiveLosses} losing elections`
      );
    }
  }

  await govCol.updateOne(
    { _id: countryId },
    {
      $set: {
        coalitionRefusals: next,
        coalitionRefusalElection: { key: electionKey ?? "seed", seats },
      },
    }
  );
  return next;
}
