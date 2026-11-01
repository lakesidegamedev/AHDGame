import { describe, it, expect } from "vitest";
import type { Election } from "@/lib/db/types";
import { isCampaignEligibleElection } from "./isCampaignEligible";

describe("isCampaignEligibleElection: presidential only", () => {
  describe("Presidential path", () => {
    it("enables only a valid bound Russian popular ballot through the runtime seam", () => {
      const election = {
        countryId: "RU" as const,
        electionType: "president" as const,
        russianPresidentialRound: {
          round: 1 as const,
          mandateSinceTurn: 72,
          registeredVoters: 100,
        },
      };
      expect(isCampaignEligibleElection(election)).toBe(true);
      expect(
        isCampaignEligibleElection({
          ...election,
          russianPresidentialRound: { ...election.russianPresidentialRound, registeredVoters: 0 },
        })
      ).toBe(false);
    });
    it("returns true for US presidential elections", () => {
      expect(isCampaignEligibleElection({ countryId: "US", electionType: "president" })).toBe(true);
    });
  });

  describe("Non-presidential races campaign through Actions, not Campaign Manager", () => {
    it("returns false for every US down-ballot race", () => {
      for (const electionType of ["senate", "governor", "house", "stateSenate"]) {
        expect(isCampaignEligibleElection({ countryId: "US", electionType })).toBe(false);
      }
    });
    it("returns false for UK and JP parliamentary and governor races", () => {
      for (const electionType of ["commons", "special_commons", "regionalCouncil"]) {
        expect(isCampaignEligibleElection({ countryId: "UK", electionType })).toBe(false);
      }
      for (const electionType of ["shugiin", "snap_shugiin", "sangiin", "governor"]) {
        expect(isCampaignEligibleElection({ countryId: "JP", electionType })).toBe(false);
      }
    });
    it("returns false for DE bundestag", () => {
      expect(isCampaignEligibleElection({ countryId: "DE", electionType: "bundestag" })).toBe(
        false
      );
    });
  });

  describe("Defensive guards", () => {
    it("returns false when countryId is missing", () => {
      expect(isCampaignEligibleElection({ electionType: "president" })).toBe(false);
      expect(isCampaignEligibleElection({ electionType: "senate" })).toBe(false);
    });
    it("returns false when electionType is missing", () => {
      expect(isCampaignEligibleElection({ countryId: "US" })).toBe(false);
    });
    it("returns false for unknown electionType strings", () => {
      expect(
        isCampaignEligibleElection({
          countryId: "US",
          electionType: "fictional-race-type" as unknown as Election["electionType"],
        })
      ).toBe(false);
    });
  });
});
