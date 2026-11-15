import type { Db } from "mongodb";
import type { NPP } from "@/lib/db/types";
import { generateNPP, type NPPGenerationContext } from "@/lib/npp/generator";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { countersCollection } from "@/lib/db/repositories/counters";
import { CA_ELECTIONS } from "./elections";
import { planCaElectionBench } from "./rules/electionBench";

/** Fresh historical bootstrap supplies candidates; the normal entry host files them. */
export async function seedCaElectionBench(
  db: Db,
  preset: string,
  log: (message: string) => void = () => {}
): Promise<number> {
  if (preset !== "2027-default") return 0;
  const world = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { startingPartiesMode: 1 } }
  );
  if ((world?.startingPartiesMode ?? "default") !== "default") return 0;
  const [regions, parties, orgs, actors, officials, candidates, races] = await Promise.all([
    statesCollection(db)
      .find({ countryId: "CA" }, { projection: { _id: 1, countryId: 1 } })
      .toArray(),
    politicalPartiesCollection(db)
      .find(
        { countryId: "CA", isDefault: true },
        {
          projection: {
            sequentialId: 1,
            countryId: 1,
            isDefault: 1,
            economicPosition: 1,
            socialPosition: 1,
          },
        }
      )
      .toArray(),
    statePartyOrgCollection(db)
      .find(
        { countryId: "CA" },
        {
          projection: { countryId: 1, stateId: 1, partyId: 1, hasPresence: 1 },
        }
      )
      .toArray(),
    nppsCollection(db)
      .find(
        { retiredAt: null },
        {
          projection: {
            name: 1,
            countryId: 1,
            party: 1,
            homeState: 1,
            retiredAt: 1,
            isTechnocrat: 1,
          },
        }
      )
      .toArray(),
    electedOfficialsCollection(db)
      .find(
        { countryId: "CA", nppId: { $ne: null } },
        {
          projection: { nppId: 1 },
        }
      )
      .toArray(),
    electionCandidatesCollection(db)
      .find(
        { countryId: "CA", status: "active" },
        {
          projection: { nppId: 1, characterId: 1, electionId: 1, party: 1 },
        }
      )
      .toArray(),
    electionsCollection(db)
      .find(
        { countryId: "CA", status: { $in: ["active", "upcoming"] } },
        { projection: { state: 1, electionType: 1 } }
      )
      .toArray(),
  ]);
  const slots = planCaElectionBench({
    preset,
    startingPartiesMode: world?.startingPartiesMode,
    regionalRaceCount: CA_ELECTIONS.electionPhases!.length,
    regions,
    parties,
    orgs,
    actors: actors.map((actor) => ({
      ...actor,
      id: String(actor._id),
      retired: !!actor.retiredAt,
    })),
    busyActorIds: new Set([
      ...officials.flatMap((official) => (official.nppId ? [String(official.nppId)] : [])),
      ...candidates.map((candidate) => String(candidate.nppId ?? candidate.characterId)),
    ]),
    filedSlots: candidates.flatMap((candidate) => {
      const race = races.find((row) => String(row._id) === String(candidate.electionId));
      return race
        ? [{ regionId: race.state, partyId: candidate.party, electionType: race.electionType }]
        : [];
    }),
  });
  if (!slots.length) return 0;
  const types = await legislationTypesCollection(db)
    .find(
      {},
      {
        projection: {
          _id: 1,
          "policyOptions.stance": 1,
          "policyOptions.economic": 1,
          "policyOptions.social": 1,
        },
      }
    )
    .toArray();
  const context: NPPGenerationContext = {
    existingNames: new Set(actors.map((actor) => actor.name)),
    partyPositions: new Map(parties.map((party) => [`CA:${party.sequentialId}`, party])),
    legislationTypes: types,
  };
  const generated: NPP[] = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++)
      generated.push(
        await generateNPP(
          {
            countryId: "CA",
            party: slot.partyId,
            state: slot.regionId,
            year: 2027,
          },
          context,
          db
        )
      );
  }
  const counter = await countersCollection(db).findOneAndUpdate(
    { _id: "npp" },
    { $inc: { seq: generated.length } },
    { upsert: true, returnDocument: "after" }
  );
  if (!counter) throw new Error("Failed to reserve Canadian election bench ids");
  generated.forEach((actor, index) => {
    actor.sequentialId = counter.seq - generated.length + index + 1;
  });
  await nppsCollection(db).insertMany(generated);
  log(`Seeded ${generated.length} unseated Canadian regional election candidates`);
  return generated.length;
}
