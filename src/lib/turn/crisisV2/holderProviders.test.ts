import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { officeHolderProvider } from "./holderProviders";

const id = () => new ObjectId();

function makeDb(data: Record<string, Record<string, unknown>[]>) {
  const filters: Record<string, unknown[]> = {};
  const db = {
    collection(name: string) {
      return {
        find(filter: unknown) {
          (filters[name] ??= []).push(filter);
          const byId = (filter as { _id?: { $in: ObjectId[] } })._id?.$in;
          const rows = data[name] ?? [];
          // the leader lookup asks for characters by id; the office scan does not
          const picked = byId
            ? rows.filter((row) => byId.some((value) => String(value) === String(row._id)))
            : rows.filter((row) => name !== "characters" || row.currentOffice);
          return { toArray: async () => picked };
        },
      };
    },
  };
  return { db: db as never, filters };
}

describe("officeHolderProvider", () => {
  it("resolves every role from its owning collection, per country", async () => {
    const [pres, gov, chair, fin, speaker, party, ceo, pm] = Array.from({ length: 8 }, id);
    const { db } = makeDb({
      characters: [
        { _id: pres, countryId: "US", currentOffice: { type: "president" } },
        { _id: gov, countryId: "US", currentOffice: { type: "governor" } },
        { _id: speaker, countryId: "US" },
      ],
      governmentFormations: [{ _id: "UK", pmCharacterId: pm }],
      centralBanks: [{ countryId: "US", chairCharacterId: chair }],
      cabinetMembers: [
        { countryId: "US", positionId: "secretary_of_treasury", characterId: fin },
        { countryId: "US", positionId: "secretary_of_state", characterId: id() },
      ],
      congressLeaders: [{ characterId: speaker }],
      politicalParties: [{ countryId: "US", chairId: party }],
      corporations: [{ countryId: "US", ceoId: ceo }],
    });
    const holders = await officeHolderProvider.load({
      db,
      turn: 5,
      countryIds: new Set(["US", "UK"]),
    });
    expect(holders.get("US")).toEqual({
      headOfState: [pres.toString()],
      stateGovernor: [gov.toString()],
      centralBankChair: [chair.toString()],
      financeMinister: [fin.toString()],
      legislature: [speaker.toString()],
      partyLeader: [party.toString()],
      corpCeo: [ceo.toString()],
    });
    expect(holders.get("UK")).toEqual({ headOfState: [pm.toString()] });
  });

  it("scopes every read to the requested countries and skips the db when none", async () => {
    const { db, filters } = makeDb({});
    const empty = await officeHolderProvider.load({ db, turn: 1, countryIds: new Set() });
    expect(empty.size).toBe(0);
    expect(Object.keys(filters)).toEqual([]);

    await officeHolderProvider.load({ db, turn: 1, countryIds: new Set(["US"]) });
    expect(filters.characters?.[0]).toMatchObject({ countryId: { $in: ["US"] } });
    expect(filters.centralBanks?.[0]).toMatchObject({ countryId: { $in: ["US"] } });
    expect(filters.corporations?.[0]).toMatchObject({ countryId: { $in: ["US"] } });
  });
});
