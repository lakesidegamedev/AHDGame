import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { castBackgroundOrgVotes, rulingEconomicPosition } from "./backgroundOrgVoting";

const SANCTIONS_ID = new ObjectId("64b000000000000000000101");
const FTA_ID = new ObjectId("64b000000000000000000102");
const WAR_ID = new ObjectId("64b000000000000000000103");
const ELECTION_ID = new ObjectId("64b000000000000000000104");

function world(): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("countryGameStates", [
    { _id: "US", status: "active", enabledForPlayers: true },
    { _id: "UK", status: "beta" },
    { _id: "FR", status: "beta", backgroundCountry: true },
    { _id: "PL", status: "beta", backgroundCountry: true },
    { _id: "HU", status: "beta", backgroundCountry: true },
    { _id: "RU", status: "beta", backgroundCountry: true },
  ]);
  memory.seed(
    "organizationMemberships",
    ["US", "UK", "FR", "PL", "HU"].map((countryId) => ({
      _id: new ObjectId(),
      organizationId: "NATO",
      countryId,
      status: "active",
    }))
  );
  memory.seed("countryAlignments", [
    { entityId: "US", shares: { WASHINGTON: 90 }, nonAligned: 10 },
    { entityId: "FR", shares: { WASHINGTON: 75, BEIJING: 5 }, nonAligned: 20 },
    { entityId: "PL", shares: { WASHINGTON: 85 }, nonAligned: 15 },
    { entityId: "HU", shares: { WASHINGTON: 45, BEIJING: 10, MOSCOW: 15 }, nonAligned: 30 },
    { entityId: "RU", shares: { BEIJING: 20, MOSCOW: 75 }, nonAligned: 5 },
  ]);
  memory.seed("macroCountries", [
    {
      _id: "FR",
      entityId: "FR",
      displayName: "France",
      tradeExposure: 0.35,
      fiscalCapacity: 0.45,
      nationalPolitics: {
        parties: [{ partyId: "fr-a", economic: 1.5 }],
        governmentPartyIds: ["fr-a"],
        head: { name: "Head of France" },
      },
    },
    { _id: "PL", entityId: "PL", displayName: "Poland", tradeExposure: 0.4, fiscalCapacity: 0.38 },
    { _id: "HU", entityId: "HU", displayName: "Hungary", tradeExposure: 0.8, fiscalCapacity: 0.35 },
  ]);
  const base = {
    organizationId: "NATO",
    proposingCountryId: "US",
    proposedByCharacterId: new ObjectId(),
    proposedByCharacterName: "Player",
    status: "pending",
    closesOnTurn: 30,
    votes: [] as unknown[],
  };
  memory.seed("organizationLegislation", [
    {
      ...base,
      _id: SANCTIONS_ID,
      type: "sanctions",
      title: "Sanction Russia",
      parties: [],
      sanctionsTargetCountryId: "RU",
      sanctionsCommodity: "all",
    },
    { ...base, _id: FTA_ID, type: "free_trade_agreement", title: "FTA", parties: ["US", "PL"] },
    {
      ...base,
      _id: WAR_ID,
      type: "declare_war",
      title: "War",
      parties: [],
      warDeclarationTargetCountryId: "RU",
    },
  ]);
  memory.seed("organizationLeadershipElections", [
    {
      _id: ELECTION_ID,
      organizationId: "NATO",
      candidateCharacterId: new ObjectId(),
      candidateCharacterName: "Candidate",
      candidateCountryId: "US",
      nominatedByCharacterId: new ObjectId(),
      nominatedByCharacterName: "Player",
      nominatedByCountryId: "US",
      status: "pending",
      votes: [],
      closesOnTurn: 30,
    },
  ]);
  return memory;
}

const votesOn = (memory: InMemoryDb, collection: string, id: ObjectId) =>
  (
    memory.collection(collection).docs.find((d) => String(d._id) === String(id))?.votes as {
      countryId: string;
      vote: string;
      characterName: string;
      castOnTurn: number;
    }[]
  ).map(({ countryId, vote, characterName, castOnTurn }) => ({
    countryId,
    vote,
    characterName,
    castOnTurn,
  }));

describe("castBackgroundOrgVotes", () => {
  it("casts each background member's scripted vote on the ballots it sits on", async () => {
    const memory = world();
    const cast = await castBackgroundOrgVotes(memory as unknown as Db, 5);

    // Sanctions: FR, HU, PL. FTA: PL only (a named party). Election: FR, HU, PL.
    // The war declaration stays player-only. RU is not a member.
    expect(cast).toBe(7);
    const sanctions = votesOn(memory, "organizationLegislation", SANCTIONS_ID);
    expect(sanctions.map((v) => v.countryId)).toEqual(["FR", "HU", "PL"]);
    expect(sanctions.find((v) => v.countryId === "PL")?.vote).toBe("yes");
    expect(sanctions.find((v) => v.countryId === "FR")?.characterName).toBe("Head of France");
    expect(sanctions.find((v) => v.countryId === "HU")?.characterName).toBe("Hungary Government");
    expect(sanctions.every((v) => v.castOnTurn === 5)).toBe(true);
    expect(votesOn(memory, "organizationLegislation", FTA_ID)).toEqual([
      { countryId: "PL", vote: "yes", characterName: "Poland Government", castOnTurn: 5 },
    ]);
    expect(votesOn(memory, "organizationLegislation", WAR_ID)).toEqual([]);
    expect(
      votesOn(memory, "organizationLeadershipElections", ELECTION_ID).map((v) => v.vote)
    ).toEqual(["yes", "yes", "yes"]);
  });

  it("votes once per ballot and gives the same answers in the same world", async () => {
    const first = world();
    const second = world();
    await castBackgroundOrgVotes(first as unknown as Db, 5);
    expect(await castBackgroundOrgVotes(first as unknown as Db, 6)).toBe(0);
    await castBackgroundOrgVotes(second as unknown as Db, 5);
    for (const [collection, id] of [
      ["organizationLegislation", SANCTIONS_ID],
      ["organizationLegislation", FTA_ID],
      ["organizationLeadershipElections", ELECTION_ID],
    ] as const) {
      expect(votesOn(second, collection, id)).toEqual(votesOn(first, collection, id));
    }
  });

  it("does nothing in a world without background countries", async () => {
    const memory = world();
    for (const doc of memory.collection("countryGameStates").docs) delete doc.backgroundCountry;
    expect(await castBackgroundOrgVotes(memory as unknown as Db, 5)).toBe(0);
    expect(votesOn(memory, "organizationLegislation", SANCTIONS_ID)).toEqual([]);
  });

  it("reads the ruling party's economic position only when the politics model has run", () => {
    expect(rulingEconomicPosition(undefined)).toBeNull();
    expect(rulingEconomicPosition({ entityId: "PL" })).toBeNull();
    expect(
      rulingEconomicPosition({
        entityId: "FR",
        nationalPolitics: {
          parties: [{ partyId: "a", economic: -2 }],
          governmentPartyIds: ["a"],
        },
      })
    ).toBe(-2);
  });
});
