/** Link opening House delegations to districts without replacing live incumbents. */
import type { Db } from "mongodb";
import type { CongressionalDistrict, ElectedOfficial, PoliticalParty } from "@/lib/db/types";
import { openingDistrictHolderPlan } from "./rules/openingHolders";
import { seatGroupsFor, US_HOUSE_2020 } from "@/lib/constants/historicalSeats";
import snapshot from "@/lib/countries/us/data/us2026ResultsSnapshot.json";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";

// Declared in the February 2020 roster, not vacancies inferred from missing officials.
const vacancies2020: Readonly<Record<string, readonly number[]>> = {
  CA: [25],
  MD: [7],
  NY: [27],
  TX: [4],
  WI: [7],
};

export async function seedOpeningHouseHolders(
  db: Db,
  preset?: string,
  log: (message: string) => void = console.warn
): Promise<number> {
  const activePreset = preset ?? (await getGameStatePresetOrDefault(db));
  const [districts, officials, parties] = await Promise.all([
    congressionalDistrictsCollection<CongressionalDistrict>(db)
      .find(
        { countryId: "US" },
        {
          projection: {
            _id: 1,
            stateId: 1,
            index: 1,
            netLean: 1,
            holderParty: 1,
            holderCharacterId: 1,
            holderNppId: 1,
          },
        }
      )
      .toArray(),
    electedOfficialsCollection<ElectedOfficial>(db)
      .find(
        { countryId: "US", officeType: "house" },
        {
          projection: {
            _id: 1,
            state: 1,
            seatsHeld: 1,
            party: 1,
            isNPP: 1,
            nppId: 1,
            characterId: 1,
          },
        }
      )
      .toArray(),
    politicalPartiesCollection<PoliticalParty>(db)
      .find(
        { countryId: "US" },
        { projection: { _id: 1, sequentialId: 1, abbreviation: 1, economicPosition: 1 } }
      )
      .toArray(),
  ]);
  const partyById = new Map(
    parties.flatMap(
      (party) =>
        [
          [String(party._id), party],
          [String(party.sequentialId), party],
        ] as const
    )
  );
  const officialById = new Map(officials.map((o) => [String(o._id), o]));
  const useSnapshot =
    activePreset === "2027-default" &&
    parties.some((p) => p.abbreviation === "DEM") &&
    parties.some((p) => p.abbreviation === "REP");
  const openingParties = openingHouseParties2027({
    districts: snapshot.house,
    delegations: US_HOUSE_2027_RESULT,
    uncalled: US_CONGRESS_RESULT_2027.house.uncalledSeats,
  });
  const sourceSeats = (seatGroupsFor(activePreset).US ?? []).filter(
    (seat) => seat.officeType === "house"
  );
  // Follow the roster actually selected, including legacy preset fallbacks.
  const vacancies = sourceSeats.some((seat) => US_HOUSE_2020.includes(seat)) ? vacancies2020 : {};
  const sourceCapacity: Record<string, number> = {};
  for (const seat of sourceSeats) {
    if (seat.state)
      sourceCapacity[seat.state] = (sourceCapacity[seat.state] ?? 0) + (seat.seatsHeld ?? 1);
  }
  for (const [state, indexes] of Object.entries(vacancies))
    sourceCapacity[state] = (sourceCapacity[state] ?? 0) + indexes.length;
  if (
    useSnapshot &&
    districts.some(
      (d) =>
        !openingParties.has(`${d.stateId}-${String(d.index).padStart(2, "0")}`) &&
        !openingParties.has(`${d.stateId}-AL`)
    )
  )
    throw new Error("Incomplete opening district results");
  const plan = openingDistrictHolderPlan({
    // Snapshot-backed openings must fail on disagreement, never silently degrade.
    ...(!useSnapshot ? { sourceCapacity } : {}),
    districts: districts.map((d) => ({
      id: d._id,
      state: d.stateId,
      lean: d.netLean,
      occupied: !!(d.holderParty || d.holderCharacterId || d.holderNppId),
      vacant: vacancies[d.stateId]?.includes(d.index) ?? false,
      ...(useSnapshot
        ? {
            openingParty:
              openingParties.get(`${d.stateId}-${String(d.index).padStart(2, "0")}`) ??
              openingParties.get(`${d.stateId}-AL`),
          }
        : {}),
    })),
    officials: officials.map((o) => {
      const party = partyById.get(String(o.party));
      if (!o.state) throw new Error("Opening House official has no state");
      if (!party && o.party !== "independent")
        throw new Error(`Unknown opening House party in ${o.state}`);
      return {
        id: String(o._id),
        state: o.state,
        seats: o.seatsHeld ?? 1,
        party: party?.abbreviation ?? "IND",
        position: party?.economicPosition ?? 0,
      };
    }),
  });
  for (const unsupported of plan.unsupportedStates) log(unsupported.reason);
  const updates = plan.assignments;
  if (updates.length)
    await congressionalDistrictsCollection<CongressionalDistrict>(db).bulkWrite(
      updates.map((u) => {
        const official = officialById.get(u.officialId)!;
        return {
          updateOne: {
            filter: {
              _id: u.districtId,
              holderCharacterId: null,
              holderNppId: null,
              holderParty: null,
            },
            update: {
              $set: {
                holderParty: u.party,
                holderNppId: official.isNPP ? (official.nppId ?? null) : null,
                holderCharacterId: official.isNPP ? null : (official.characterId ?? null),
              },
            },
          },
        };
      })
    );
  return updates.length;
}

import { openingHouseParties2027 } from "@/lib/countries/us/rules/openingHouseParties2027";
import {
  US_HOUSE_2027_RESULT,
  US_CONGRESS_RESULT_2027,
} from "@/lib/countries/us/data/usCongressResult2027";

import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";

import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";

import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
