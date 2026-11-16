/**
 * Actuates a bloc of states that leave together as one new country. The states
 * already are the successor's regions, so nothing fans out: their documents
 * keep their ids and move to the successor, which then gets its own budget,
 * parties, interim head of government and first elections.
 */
import type { Db, Document } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { updateParliamentaryGovernmentSeats } from "@/lib/turn/parliamentaryGovernment";
import { activateCountry } from "@/lib/country/registeredCountries";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { countiesCollection } from "@/lib/db/repositories/counties";
import { refundConversionConstruction } from "../refundConversionConstruction";
import { rescopeRegionToCountry } from "../transfer/regionScopedCollections";
import { entryRegionIds, type SovereigntyRegion } from "../rules/sovereigntyRegions";
import { promoteEconomyToNational } from "./promoteEconomyToNational";
import { splitParties } from "./splitParties";
import { carryOverOfficials } from "./carryOverOfficials";
import { standupElections } from "./standupElections";
import { SUB_REGION_SEEDS, type SecedingCountryId } from "./subRegions";
import type { SecedeRegionResult } from "./secedeRegion";
import { finishSecession } from "./finishSecession";

export async function secedeBloc(
  db: Db,
  originalDb: Db,
  entry: SovereigntyRegion,
  toCountryId: SecedingCountryId,
  fromCountryId: CountryId,
  currentTurn: number
): Promise<SecedeRegionResult> {
  const members = [...entryRegionIds(entry)];
  const rows = await statesCollection(db)
    .find({ _id: { $in: members } })
    .toArray();
  if (rows.length === members.length && rows.every((row) => row.countryId === toCountryId))
    return { ok: true, skipped: "already-seceded" };
  if (rows.length !== members.length) return { ok: false, skipped: "region-not-found" };

  for (const member of members) await refundConversionConstruction(db, member, currentTurn);
  await activateCountry(db, toCountryId);

  // The parent's races for these states end with their seats.
  const oldRaces = await electionsCollection<Document>(db)
    .find(
      {
        countryId: fromCountryId,
        state: { $in: members },
        status: { $in: ["active", "upcoming", "completed"] },
      },
      { projection: { _id: 1 } }
    )
    .toArray();
  const electionIds = oldRaces.map((row) => row._id);
  await electionCandidatesCollection<Document>(db).deleteMany({ electionId: { $in: electionIds } });
  await electionsCollection<Document>(db).deleteMany({ _id: { $in: electionIds } });

  for (const member of members)
    await rescopeRegionToCountry(db, member, fromCountryId, toCountryId);

  const now = new Date();
  const seeds = new Map(SUB_REGION_SEEDS[toCountryId].map((seed) => [seed._id, seed]));
  await statesCollection(db).bulkWrite(
    members.map((member) => {
      const seed = seeds.get(member);
      return {
        updateOne: {
          filter: { _id: member },
          update: {
            $set: {
              countryId: toCountryId,
              regionType: "region" as const,
              region: seed?.region ?? "New England",
              votingSystem: seed?.votingSystem ?? ("fptp" as const),
              houseDistricts: seed?.houseDistricts ?? 1,
              stateSenateSeats: 0,
              updatedAt: now,
            },
            $unset: { parentRegionId: "" as const },
          },
        },
      };
    })
  );
  await nppsCollection<Document>(db).updateMany(
    { homeState: { $in: members } },
    { $set: { countryId: toCountryId } }
  );
  await corporationsCollection(db).updateMany(
    { headquartersState: { $in: members } },
    { $set: { countryId: toCountryId } }
  );
  // The parent's constituency layer ends with its states.
  await countiesCollection<Document>(db).deleteMany({
    countryId: fromCountryId,
    stateId: { $in: members },
  });

  await promoteEconomyToNational(db, fromCountryId, toCountryId, currentTurn);
  const split = await splitParties(db, entry.regionId, fromCountryId, toCountryId);
  const carried = await carryOverOfficials(
    db,
    entry.regionId,
    fromCountryId,
    toCountryId,
    split.idMap
  );
  await updateParliamentaryGovernmentSeats(db, fromCountryId);
  await standupElections(db, toCountryId, currentTurn, now);
  await finishSecession(db, originalDb, {
    label: entry.regionId,
    title: entry.displayName ?? entry.regionId,
    details: { regionId: entry.regionId, memberRegionIds: members, fromCountryId, toCountryId },
    fromCountryId,
    toCountryId,
    currentTurn,
  });

  return {
    ok: true,
    report: {
      split: { wholesale: split.wholesale, independentized: split.independentized },
      carried,
      inserted: 0,
    },
  };
}
