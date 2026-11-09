import { getFullSimulationCountryIds } from "@/lib/country/countryTier";
import type { CountryId } from "@/lib/constants/countries";
import type { Db } from "mongodb";
import type { PartyHistorySnapshot, StatePartyOrg } from "@/lib/db/types";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getNppsCollection } from "@/lib/db/collections/npps";

const HISTORY_CAP = 48;

type CountRow = { _id: { countryId: string; party: string }; count: number };
type OrgRow = { _id: { countryId: string; partyId: string }; organization: number };

/**
 * Snapshot per-party organization and membership counts once per turn.
 * Used by the parties page trend chart.
 */
export async function snapshotPartyHistory(db: Db, turn: number): Promise<number> {
  // Full-simulation countries only: a background country (#5702) has no
  // politicians, government or legislature for this phase to run.
  const activeCountries = await getFullSimulationCountryIds(db);
  if (activeCountries.length === 0) return 0;

  const countryFilter = { countryId: { $in: activeCountries } };
  const partyIds = activeCountries.map((id) => id);

  const [parties, orgRows, playerRows, nppRows] = await Promise.all([
    (await getPoliticalPartiesCollection(db))
      .find(countryFilter)
      .project({ sequentialId: 1, countryId: 1 })
      .toArray(),
    db
      .collection<StatePartyOrg>("statePartyOrg")
      .aggregate<OrgRow>([
        { $match: { countryId: { $in: partyIds } } },
        {
          $group: {
            _id: { countryId: "$countryId", partyId: "$partyId" },
            organization: { $sum: "$organization" },
          },
        },
      ])
      .toArray(),
    (await getCharactersCollection(db))
      .aggregate<CountRow>([
        { $match: { countryId: { $in: partyIds } } },
        {
          $group: {
            _id: {
              countryId: { $ifNull: ["$countryId", "US"] },
              party: "$party",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    (await getNppsCollection(db))
      .aggregate<CountRow>([
        { $match: { countryId: { $in: partyIds }, retiredAt: null } },
        {
          $group: {
            _id: {
              countryId: { $ifNull: ["$countryId", "US"] },
              party: "$party",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const orgMap = new Map(
    orgRows.map((row) => [`${row._id.countryId}:${row._id.partyId}`, row.organization])
  );
  const playerMap = new Map(
    playerRows.map((row) => [`${row._id.countryId}:${row._id.party}`, row.count])
  );
  const nppMap = new Map(
    nppRows.map((row) => [`${row._id.countryId}:${row._id.party}`, row.count])
  );

  const snapshotCol = db.collection<PartyHistorySnapshot>("partyHistory");
  const now = new Date();

  const snapshots = parties.map((party) => {
    const countryId = party.countryId as CountryId;
    const partyId = String(party.sequentialId);
    const key = `${countryId}:${partyId}`;
    const playerCount = playerMap.get(key) ?? 0;
    const nppCount = nppMap.get(key) ?? 0;
    const organization = orgMap.get(key) ?? 0;
    const memberCount = playerCount + nppCount;

    return {
      updateOne: {
        filter: { _id: `${countryId}:${partyId}:${turn}` },
        update: {
          $set: {
            _id: `${countryId}:${partyId}:${turn}`,
            countryId,
            partyId,
            turn,
            organization: Math.round(organization * 100) / 100,
            playerCount,
            nppCount,
            memberCount,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  if (snapshots.length > 0) {
    await snapshotCol.bulkWrite(snapshots, { ordered: false });
  }

  const minTurn = Math.max(1, turn - HISTORY_CAP + 1);
  await snapshotCol.deleteMany({
    countryId: { $in: activeCountries },
    turn: { $lt: minTurn },
  });

  return snapshots.length;
}
