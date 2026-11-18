import { describe, expect, it } from "vitest";
import {
  MAJOR_PARTY_REGISTRATION_SHARE,
  nationalRegistrationShares,
  nomineeNationalInfluence,
} from "./nomineeReachFloor";
import { presidentialRulesetFor } from "@/lib/elections/presidentialRuleset";

const pops = new Map([
  ["CA", 40],
  ["TX", 30],
]);
const rows = [
  { partyId: "1", stateId: "CA", registration: 50 },
  { partyId: "2", stateId: "CA", registration: 27 },
  { partyId: "3", stateId: "CA", registration: 1 },
  { partyId: "1", stateId: "TX", registration: 35 },
  { partyId: "2", stateId: "TX", registration: 45 },
  { partyId: "3", stateId: "TX", registration: 2 },
];

describe("nationalRegistrationShares", () => {
  it("population-weights each state's registration", () => {
    const shares = nationalRegistrationShares(rows, pops);
    expect(shares.get("1")).toBeCloseTo((0.5 * 40 + 0.35 * 30) / 70);
    expect(shares.get("2")).toBeCloseTo((0.27 * 40 + 0.45 * 30) / 70);
    expect(shares.get("3")).toBeLessThan(MAJOR_PARTY_REGISTRATION_SHARE);
  });

  it("returns nothing without population", () => {
    expect(nationalRegistrationShares(rows, new Map()).size).toBe(0);
  });
});

describe("nomineeNationalInfluence", () => {
  const shares = nationalRegistrationShares(rows, pops);

  it("lifts a low-influence major-party nominee to the floor", () => {
    expect(nomineeNationalInfluence(2, "1", shares, 25)).toBe(25);
  });

  it("keeps influence above the floor in full", () => {
    expect(nomineeNationalInfluence(40, "2", shares, 25)).toBe(40);
  });

  it("leaves minor parties and independents on their own influence", () => {
    expect(nomineeNationalInfluence(2, "3", shares, 25)).toBe(2);
    expect(nomineeNationalInfluence(2, "independent", shares, 25)).toBe(2);
    expect(nomineeNationalInfluence(2, null, shares, 25)).toBe(2);
  });

  it("is the identity when the floor is off", () => {
    expect(nomineeNationalInfluence(2, "1", shares, 0)).toBe(2);
  });

  it("only v3 races carry the floor", () => {
    expect(presidentialRulesetFor({ rulesetVersion: 3 }).generalNomineeReachFloorNI).toBe(25);
    expect(presidentialRulesetFor({ rulesetVersion: 2 }).generalNomineeReachFloorNI).toBe(0);
    expect(presidentialRulesetFor({}).generalNomineeReachFloorNI).toBe(0);
  });
});
