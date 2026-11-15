import { describe, expect, it } from "vitest";
import {
  isNationwideDirectExecutiveElection,
  isPresidentialElectionType,
} from "./nationwideExecutive";

describe("isPresidentialElectionType", () => {
  it("covers the regular and the special presidential race only", () => {
    expect(isPresidentialElectionType("president")).toBe(true);
    expect(isPresidentialElectionType("special_president")).toBe(true);
    expect(isPresidentialElectionType("special_governor")).toBe(false);
    expect(isPresidentialElectionType("primeMinister")).toBe(false);
  });
});

describe("isNationwideDirectExecutiveElection", () => {
  it("treats a special presidential election as national", () => {
    expect(isNationwideDirectExecutiveElection("special_president", "FR", "FR")).toBe(true);
    expect(isNationwideDirectExecutiveElection("special_president", "IDF", "FR")).toBe(false);
  });
});
