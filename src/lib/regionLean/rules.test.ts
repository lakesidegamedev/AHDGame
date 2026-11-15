import { describe, expect, it } from "vitest";
import {
  marginStrength,
  partyShortName,
  pickMainParties,
  regionLeanVerdict,
  type PartyPlatform,
} from "./rules";

const dem: PartyPlatform = {
  id: "d",
  name: "Democratic Party",
  lean: -2,
  isDefault: true,
  memberCount: 10,
};
const rep: PartyPlatform = {
  id: "r",
  name: "Republican Party",
  lean: 2,
  isDefault: true,
  memberCount: 12,
};
const lib: PartyPlatform = { id: "l", name: "Liberal Party of Canada", lean: -1, isDefault: true };
const con: PartyPlatform = {
  id: "c",
  name: "Conservative Party of Canada",
  lean: 3,
  isDefault: true,
};

function labelFor(lean: number, parties: PartyPlatform[]): string {
  const main = pickMainParties(parties);
  if (!main) throw new Error("no main parties");
  return regionLeanVerdict(lean, main).label;
}

describe("regionLeanVerdict", () => {
  it("labels US regions against an even split of 0", () => {
    const us = [dem, rep];
    expect(labelFor(1.52, us)).toBe("Solid Republican");
    expect(labelFor(-0.67, us)).toBe("Solid Democratic");
    expect(labelFor(0.44, us)).toBe("Likely Republican");
    expect(labelFor(-0.2, us)).toBe("Leans Democratic");
    expect(labelFor(0.05, us)).toBe("Swing");
  });

  it("centres Canada on the Liberal and Conservative midpoint", () => {
    const ca = [lib, con];
    expect(pickMainParties(ca)?.evenSplit).toBe(1);
    expect(labelFor(0.83, ca)).toBe("Leans Liberal");
    expect(labelFor(2.15, ca)).toBe("Solid Conservative");
    expect(labelFor(1, ca)).toBe("Swing");
  });
});

describe("marginStrength", () => {
  it("buckets on the named thresholds", () => {
    expect(marginStrength(4.9)).toBe("swing");
    expect(marginStrength(5)).toBe("leans");
    expect(marginStrength(9.9)).toBe("leans");
    expect(marginStrength(10)).toBe("likely");
    expect(marginStrength(19.9)).toBe("likely");
    expect(marginStrength(20)).toBe("solid");
  });
});

describe("pickMainParties", () => {
  it("takes the two largest by members", () => {
    const small: PartyPlatform = { id: "s", name: "Small", lean: -4, memberCount: 1 };
    const main = pickMainParties([small, dem, rep]);
    expect(main?.low.id).toBe("d");
    expect(main?.high.id).toBe("r");
  });

  it("falls back to the furthest-apart default parties when nobody has members", () => {
    const a: PartyPlatform = { id: "a", name: "A", lean: -3, isDefault: true };
    const b: PartyPlatform = { id: "b", name: "B", lean: 0, isDefault: true };
    const c: PartyPlatform = { id: "c", name: "C", lean: 2, isDefault: true };
    const custom: PartyPlatform = { id: "x", name: "X", lean: 5 };
    const main = pickMainParties([a, b, c, custom]);
    expect([main?.low.id, main?.high.id]).toEqual(["a", "c"]);
  });

  it("falls back to any parties when no defaults differ", () => {
    const a: PartyPlatform = { id: "a", name: "A", lean: 1 };
    const b: PartyPlatform = { id: "b", name: "B", lean: 3 };
    expect(pickMainParties([a, b])?.evenSplit).toBe(2);
  });

  it("returns null with fewer than two parties or no spread", () => {
    expect(pickMainParties([dem])).toBeNull();
    expect(pickMainParties([])).toBeNull();
    expect(
      pickMainParties([
        { id: "a", name: "A", lean: 1 },
        { id: "b", name: "B", lean: 1 },
      ])
    ).toBeNull();
  });
});

describe("partyShortName", () => {
  it("drops Party and place suffixes", () => {
    expect(partyShortName(dem)).toBe("Democratic");
    expect(partyShortName(lib)).toBe("Liberal");
    expect(partyShortName({ name: "Social Democrats" })).toBe("Social Democrats");
  });
});
