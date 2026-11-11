/** Link opening House delegations to districts without replacing live incumbents. */
import type { Db } from "mongodb";
import type { CongressionalDistrict, ElectedOfficial, PoliticalParty } from "@/lib/db/types";
import { openingDistrictHolders } from "./rules/openingHolders";
import snapshot from "@/lib/countries/us/data/us2026ResultsSnapshot.json";

export async function seedOpeningHouseHolders(db: Db, preset?: string): Promise<number> {
  const [districts, officials, parties] = await Promise.all([
    db
      .collection<CongressionalDistrict>("congressionalDistricts")
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
    db
      .collection<ElectedOfficial>("electedOfficials")
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
    db
      .collection<PoliticalParty>("politicalParties")
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
    preset === "2027-default" &&
    parties.some((p) => p.abbreviation === "DEM") &&
    parties.some((p) => p.abbreviation === "REP");
  const openingParties = new Map(
    snapshot.house.map((row) => [
      row.district,
      row.party === "D" ? "DEM" : row.party === "R" ? "REP" : "IND",
    ])
  );
  const updates = openingDistrictHolders({
    districts: districts.map((d) => ({
      id: d._id,
      state: d.stateId,
      lean: d.netLean,
      occupied: !!(d.holderParty || d.holderCharacterId || d.holderNppId),
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
  if (updates.length)
    await db.collection<CongressionalDistrict>("congressionalDistricts").bulkWrite(
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
