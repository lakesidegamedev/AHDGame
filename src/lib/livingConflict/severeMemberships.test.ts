import { describe, expect, it } from "vitest";
import { severeCountryIdsFromStates } from "./severeMemberships";

const available = new Set(["US", "UK", "JP", "DE", "CN"]);

describe("living-conflict severe memberships for the crisis spawners", () => {
  it("counts wave families by their current members only", () => {
    const ids = severeCountryIdsFromStates(
      [
        {
          defKey: "infrastructure_cyberattack",
          hasOpened: true,
          status: "active",
          openedYear: 2030,
          tracks: { "member:UK": 1, "member:JP": 0 },
        },
      ],
      available
    );
    expect(ids).toEqual([["UK"]]);
  });

  it("counts both principals of the strait crisis", () => {
    const ids = severeCountryIdsFromStates(
      [{ defKey: "pacific_strait_crisis", hasOpened: true, status: "active", openedYear: 2031 }],
      available
    );
    expect(ids).toHaveLength(1);
    expect([...ids[0]!].sort()).toEqual(["CN", "US"]);
  });

  it("ignores conflicts that are not active", () => {
    const ids = severeCountryIdsFromStates(
      [
        { defKey: "pacific_strait_crisis", hasOpened: true, status: "settled", openedYear: 2031 },
        { defKey: "ai_labour_shock", hasOpened: false, status: "dormant", openedYear: null },
      ],
      available
    );
    expect(ids).toEqual([]);
  });
});
