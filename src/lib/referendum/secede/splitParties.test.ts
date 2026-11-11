import { describe, it, expect } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { splitParties } from "./splitParties";

function seedWorld() {
  return makeStrictInMemoryStore({
    politicalParties: [
      { _id: "snp", sequentialId: 20, countryId: "UK", name: "SNP", abbreviation: "SNP" },
      { _id: "lab", sequentialId: 21, countryId: "UK", name: "Labour", abbreviation: "LAB" },
      { _id: "con", sequentialId: 22, countryId: "UK", name: "Conservative", abbreviation: "CON" },
    ],
    electedOfficials: [
      { _id: "o1", countryId: "UK", officeType: "commons", state: "SCO", party: "20" }, // SNP, SCO only
      { _id: "o2", countryId: "UK", officeType: "commons", state: "SCO", party: "21" }, // LAB in SCO
      { _id: "o3", countryId: "UK", officeType: "commons", state: "ENG", party: "21" }, // LAB outside → UK-wide
      { _id: "o4", countryId: "UK", officeType: "commons", state: "SCO", party: "22" }, // CON, SCO only
    ],
    statePartyOrg: [
      { _id: "UK_SCO_20", countryId: "UK", stateId: "SCO", partyId: "20", organization: 60 },
      { _id: "UK_SCO_21", countryId: "UK", stateId: "SCO", partyId: "21", organization: 55 },
      { _id: "UK_SCO_22", countryId: "UK", stateId: "SCO", partyId: "22", organization: 40 },
      { _id: "UK_ENG_21", countryId: "UK", stateId: "ENG", partyId: "21", organization: 70 },
    ],
    // Members already re-homed to SCO by SP2b.
    characters: [
      { _id: "cA", countryId: "SCO", party: "20" },
      { _id: "cB", countryId: "SCO", party: "21" },
      { _id: "cC", countryId: "SCO", party: "22" },
      { _id: "cD", countryId: "SCO", party: "20" },
    ],
    partyBudget: [{ _id: "pb1", stateId: "SCO", partyId: "22" }],
  });
}

describe("splitParties", () => {
  // Regression: the UK regional parties now hold a seed-floor org row in every
  // region, so "has any row outside the region" no longer means the party is
  // organised outside it. Treating a floor row as real presence would flip the
  // SNP (and Sinn Fein on an NI secession) from wholesale transfer to
  // independentized — dissolving the very party the region just voted for.
  it("still transfers a region-homed major that only holds seed-floor org elsewhere", async () => {
    const { db, cols } = seedWorld();
    cols.statePartyOrg.push({
      _id: "UK_ENG_20",
      countryId: "UK",
      stateId: "ENG",
      partyId: "20",
      organization: 5,
    });

    const res = await splitParties(db, "SCO", "UK", "SCO");

    expect(res).toMatchObject({ wholesale: 1 });
    expect(res.idMap).toEqual({ 20: 1 });
    const snp = cols.politicalParties.find((p) => p._id === "snp")!;
    expect(snp).toMatchObject({ countryId: "SCO", sequentialId: 1 });
  });

  it("treats real organisation outside the region as outside presence", async () => {
    const { db, cols } = seedWorld();
    // 35 org in England is a genuine national footprint, not a seed floor, so
    // the SNP is no longer region-homed and does not emigrate wholesale.
    cols.statePartyOrg.push({
      _id: "UK_ENG_20",
      countryId: "UK",
      stateId: "ENG",
      partyId: "20",
      organization: 35,
    });

    const res = await splitParties(db, "SCO", "UK", "SCO");

    expect(res).toMatchObject({ wholesale: 0 });
  });

  it("transfers only the region-homed major; independentizes UK-wide majors and non-majors", async () => {
    const { db, cols } = seedWorld();
    const res = await splitParties(db, "SCO", "UK", "SCO");

    expect(res).toMatchObject({ wholesale: 1, independentized: 2 });
    expect(res.idMap).toEqual({ 20: 1 });

    // SNP moved wholesale: same doc, now SCO with id 1.
    const snp = cols.politicalParties.find((p) => p._id === "snp")!;
    expect(snp).toMatchObject({ countryId: "SCO", sequentialId: 1 });

    // LAB independentized: only the UK parent remains, no SCO successor doc.
    const labDocs = cols.politicalParties.filter((p) => p.abbreviation === "LAB");
    expect(labDocs).toHaveLength(1);
    expect(labDocs[0]).toMatchObject({ countryId: "UK", sequentialId: 21 });

    // CON stays a UK party (no SCO doc).
    expect(
      cols.politicalParties.some((p) => p.abbreviation === "CON" && p.countryId === "SCO")
    ).toBe(false);
  });

  it("removes party leadership permissions that would remain across the new border", async () => {
    const { db, cols } = seedWorld();
    const snp = cols.politicalParties.find((row) => row._id === "snp")!;
    const lab = cols.politicalParties.find((row) => row.abbreviation === "LAB")!;
    Object.assign(snp, { chairId: "cA", viceChairId: "outside", committeeIds: ["cA", "outside"] });
    Object.assign(lab, { chairId: "cB" });
    const org = cols.statePartyOrg.find((row) => row._id === "UK_SCO_20")!;
    Object.assign(org, { chairId: "cA", treasurerId: "outside", treasury: 100 });
    await splitParties(db, "SCO", "UK", "SCO");
    expect(snp).toMatchObject({ chairId: "cA", viceChairId: null, committeeIds: ["cA"] });
    expect(lab.chairId).toBeNull();
    const capital = cols.statePartyOrg.find((row) => row._id === "SCO_LOT_1")!;
    expect(capital).toMatchObject({ chairId: "cA", treasurerId: null });
    expect(
      cols.statePartyOrg
        .filter((row) => row.countryId === "SCO")
        .reduce((sum, row) => sum + Number(row.treasury ?? 0), 0)
    ).toBeCloseTo(100);
  });
  it("re-parties members: the transferred major remapped, everyone else independent", async () => {
    const { db, cols } = seedWorld();
    await splitParties(db, "SCO", "UK", "SCO");
    const party = (id: string) => cols.characters.find((c) => c._id === id)!.party;
    expect(party("cA")).toBe("1"); // SNP → 1
    expect(party("cB")).toBe("independent"); // LAB (UK-wide) → independent
    expect(party("cC")).toBe("independent"); // CON → independent
    expect(party("cD")).toBe("1");
  });

  it("re-homes the transferred major's org to the capital; drops the rest + ledgers", async () => {
    const { db, cols } = seedWorld();
    await splitParties(db, "SCO", "UK", "SCO");
    // SNP org re-keyed onto the capital under SCO.
    expect(cols.statePartyOrg.some((g) => g._id === "SCO_LOT_1" && g.organization === 60)).toBe(
      true
    );
    // LAB + CON region orgs dropped (independentized); LAB's England org untouched.
    expect(cols.statePartyOrg.some((g) => g.stateId === "SCO" && g.partyId === "21")).toBe(false);
    expect(cols.statePartyOrg.some((g) => g.partyId === "22")).toBe(false);
    expect(cols.statePartyOrg.some((g) => g._id === "UK_ENG_21")).toBe(true);
    // Region party-ledger history dissolved.
    expect(cols.partyBudget).toHaveLength(0);
  });
  // Regression: every party's slate for one election was relabelled "independent",
  // so two slates for the same election hit the unique (countryId, partyId,
  // electionId) index and the secession rolled back on every turn.
  it("retires slates of dissolved parties instead of colliding on the unique slate key", async () => {
    const { cols } = seedWorld();
    const election = "election-1";
    const slates = [
      { _id: "sSnp", countryId: "SCO", partyId: "20", electionId: election },
      { _id: "sLab", countryId: "SCO", partyId: "21", electionId: election },
      { _id: "sCon", countryId: "SCO", partyId: "22", electionId: election },
      { _id: "sUk", countryId: "UK", partyId: "21", electionId: election },
    ];
    const world = makeStrictInMemoryStore({
      politicalParties: cols.politicalParties,
      electedOfficials: cols.electedOfficials,
      statePartyOrg: cols.statePartyOrg,
      characters: cols.characters,
      recruitmentSlates: slates,
      slateCandidates: [
        { _id: "c1", slateId: "sSnp", candidateId: "cA" },
        { _id: "c2", slateId: "sLab", candidateId: "cB" },
        { _id: "c3", slateId: "sCon", candidateId: "cC" },
      ],
    });
    await splitParties(world.db, "SCO", "UK", "SCO");

    const kept = world.cols.recruitmentSlates;
    expect(kept.map((r) => r._id).sort()).toEqual(["sSnp", "sUk"]);
    expect(kept.find((r) => r._id === "sSnp")).toMatchObject({ countryId: "SCO", partyId: "1" });
    expect(kept.find((r) => r._id === "sUk")).toMatchObject({ countryId: "UK", partyId: "21" });
    const keys = kept.map((r) => `${r.countryId}|${r.partyId}|${r.electionId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(world.cols.slateCandidates.map((r) => r._id)).toEqual(["c1"]);
  });
});
