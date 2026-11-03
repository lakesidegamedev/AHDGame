import { describe, expect, it } from "vitest";
import { persuasionDriverProps } from "./persuasionDriverProps";

describe("persuasionDriverProps", () => {
  it("maps the race's candidates and driver inputs for the Persuasion Drivers card", () => {
    const { candidates, inputs } = persuasionDriverProps({
      allCandidates: [
        {
          id: "c1",
          characterId: "ch1",
          characterName: "Ann Lee",
          party: "1",
          partyColor: "#00f",
          partyEcon: -2,
          partySocial: -1,
          economicPosition: -3,
          socialPosition: 0,
          favorability: 55,
          politicalInfluence: 20,
          nationalInfluence: 5,
          isNPP: false,
          sharePct: 52,
          support: 40,
        },
      ],
      persuasionRegByParty: { "1": 0.4 },
      incumbentPartyId: "1",
      fundsByParty: { "1": 100 },
    });
    expect(candidates[0]).toMatchObject({ id: "c1", name: "Ann Lee", support: 40 });
    expect(inputs).toMatchObject({
      regByParty: { "1": 0.4 },
      incumbentPartyId: "1",
      fundsByParty: { "1": 100 },
    });
  });
});
