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
  it("merges slates that collide on (country, party, election) once parties become independent", async () => {
    const { db, cols } = seedWorld();
    const slate = (_id: string, partyId: string, electionId: string) => ({
      _id,
      countryId: "SCO",
      partyId,
      electionId,
    });
    cols.recruitmentSlates = [
      slate("s20e1", "20", "e1"),
      slate("s21e1", "21", "e1"),
      slate("s22e1", "22", "e1"),
      slate("s20e2", "20", "e2"),
      slate("s22e2", "22", "e2"),
      slate("sIndE3", "independent", "e3"),
      slate("s21e3", "21", "e3"),
    ];
    const cand = (_id: string, slateId: string, candidateId: string) => ({
      _id,
      slateId,
      candidateId,
      countryId: "SCO",
      partyId: "22",
    });
    cols.slateCandidates = [
      cand("c1", "s21e1", "A"),
      cand("c2", "s22e1", "B"),
      cand("c3", "s22e1", "A"), // duplicates A on the survivor s21e1
      cand("c4", "s22e2", "C"),
      cand("c5", "s21e3", "D"),
      cand("c6", "s20e1", "A"), // wholesale slate keeps its own candidates
    ];

    await splitParties(db, "SCO", "UK", "SCO");

    const keys = cols.recruitmentSlates.map((r) => `${r.countryId}|${r.partyId}|${r.electionId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(cols.recruitmentSlates.find((r) => r._id === "s20e1")!.partyId).toBe("1");
    expect(cols.recruitmentSlates.find((r) => r._id === "s20e2")!.partyId).toBe("1");
    for (const e of ["e1", "e2", "e3"])
      expect(
        cols.recruitmentSlates.filter((r) => r.partyId === "independent" && r.electionId === e)
      ).toHaveLength(1);
    // e1: earliest id wins; e2: only s22e2 remains; e3: the untouched independent row wins.
    expect(cols.recruitmentSlates.map((r) => r._id).sort()).toEqual(
      ["s20e1", "s20e2", "s21e1", "s22e2", "sIndE3"].sort()
    );

    const on = (slateId: string) =>
      cols.slateCandidates
        .filter((c) => c.slateId === slateId)
        .map((c) => c.candidateId)
        .sort();
    expect(on("s21e1")).toEqual(["A", "B"]); // duplicate A collapsed, B preserved
    expect(on("s22e2")).toEqual(["C"]);
    expect(on("sIndE3")).toEqual(["D"]);
    expect(on("s20e1")).toEqual(["A"]);
    expect(cols.slateCandidates).toHaveLength(5);
    expect(cols.slateCandidates.every((c) => c.partyId === "independent" || c._id === "c6")).toBe(
      true
    );
  });
});
