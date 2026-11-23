import { describe, expect, it } from "vitest";
import { partyMemberOfficeLabels } from "./partyMemberRole";

const holder = (id: string) => ({ id, name: id, sequentialId: 1 });

describe("partyMemberOfficeLabels", () => {
  it("lists every office a dual officeholder holds, with overview labels", () => {
    const party = {
      countryId: "us",
      chair: holder("a"),
      viceChair: holder("b"),
      treasurer: holder("b"),
      leadershipTitles: undefined,
    } as never;
    expect(partyMemberOfficeLabels(party, "b")).toEqual([
      "National Vice Chair",
      "National Treasurer",
    ]);
    expect(partyMemberOfficeLabels(party, "a")).toEqual(["National Chair"]);
    expect(partyMemberOfficeLabels(party, "z")).toEqual([]);
  });
});
