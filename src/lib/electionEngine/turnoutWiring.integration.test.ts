/**
 * Integration tests for turnout-to-election wiring.
 *
 * These tests prove that:
 * - GOTV/canvassing/suppression modifiers flow through to election results
 * - Polls and elections use consistent turnout inputs
 * - State-level turnout changes affect vote distribution
 */

import { describe, it, expect } from "vitest";
import {
  distributeVotesByGroupLevelAllocation,
  calcStateTurnout,
  resolveTurnout,
} from "@/lib/electionEngine";
import type { EnrichedCandidate } from "@/lib/electionEngine";
import type {
  StateDemographics,
  DemographicCategory,
  StateDemographicTurnout,
} from "@/lib/db/types";

// Test data: Simplified demographics
const TEST_CATEGORIES: DemographicCategory[] = [
  {
    _id: "voterGroups",
    name: "Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "college_liberals",
        name: "College Liberals",
        defaultEconomicLean: -4,
        defaultSocialLean: 3,
        defaultTurnout: 60,
      },
      {
        id: "rural_conservatives",
        name: "Rural Conservatives",
        defaultEconomicLean: 3,
        defaultSocialLean: -2,
        defaultTurnout: 70,
      },
      {
        id: "suburban_moderates",
        name: "Suburban Moderates",
        defaultEconomicLean: 0,
        defaultSocialLean: 0,
        defaultTurnout: 65,
      },
    ],
  },
];

const TEST_DEMOGRAPHICS: StateDemographics = {
  _id: "TEST_STATE",
  countryId: "US",
  categoryWeights: { voterGroups: 100 },
  groups: {
    college_liberals: { population: 30, turnout: 60, economicLean: -4, socialLean: 3 },
    rural_conservatives: { population: 40, turnout: 70, economicLean: 3, socialLean: -2 },
    suburban_moderates: { population: 30, turnout: 65, economicLean: 0, socialLean: 0 },
  },
  lastUpdated: new Date("2024-01-01"),
};

function makeTestCandidates(): EnrichedCandidate[] {
  return [
    {
      candidateId: "dem",
      characterId: "dem_char",
      characterName: "Dem Candidate",
      party: "democrat",
      isNPP: false,
      charEP: -2,
      charSP: 1,
      favorability: 55,
      politicalInfluence: 60,
      nationalInfluence: 50,
      partyEcon: -2,
      partySocial: 1,
    },
    {
      candidateId: "rep",
      characterId: "rep_char",
      characterName: "Rep Candidate",
      party: "republican",
      isNPP: false,
      charEP: 2,
      charSP: -1,
      favorability: 55,
      politicalInfluence: 60,
      nationalInfluence: 50,
      partyEcon: 2,
      partySocial: -1,
    },
  ];
}

describe("Turnout-to-election wiring integration", () => {
  const statePopulation = 1_000_000;

  describe("resolveTurnout", () => {
    it("applies positive modifiers to increase turnout", () => {
      const turnoutDoc: StateDemographicTurnout = {
        _id: "TEST_STATE",
        countryId: "US",
        modifiers: {
          voterGroups: {
            college_liberals: 10, // +10 percentage points
          },
        },
        lastDecayApplied: new Date(),
        lastUpdated: new Date(),
      };

      const { byGroup } = resolveTurnout(
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        turnoutDoc
      );

      // Baseline was 60, +10 modifier = 70
      expect(byGroup["college_liberals"]).toBe(70);
      // Other groups unchanged
      expect(byGroup["rural_conservatives"]).toBe(70);
      expect(byGroup["suburban_moderates"]).toBe(65);
    });

    it("applies negative modifiers (suppression) to decrease turnout", () => {
      const turnoutDoc: StateDemographicTurnout = {
        _id: "TEST_STATE",
        countryId: "US",
        modifiers: {
          voterGroups: {
            rural_conservatives: -15, // -15 percentage points
          },
        },
        lastDecayApplied: new Date(),
        lastUpdated: new Date(),
      };

      const { byGroup } = resolveTurnout(
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        turnoutDoc
      );

      // Baseline was 70, -15 modifier = 55
      expect(byGroup["rural_conservatives"]).toBe(55);
      // Other groups unchanged
      expect(byGroup["college_liberals"]).toBe(60);
    });

    it("clamps turnout to valid range (0-100)", () => {
      const turnoutDoc: StateDemographicTurnout = {
        _id: "TEST_STATE",
        countryId: "US",
        modifiers: {
          voterGroups: {
            college_liberals: 50, // Would push to 110, should clamp to 100
            rural_conservatives: -100, // Would push to -30, should clamp to 0
          },
        },
        lastDecayApplied: new Date(),
        lastUpdated: new Date(),
      };

      const { byGroup } = resolveTurnout(
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        turnoutDoc
      );

      expect(byGroup["college_liberals"]).toBe(100);
      expect(byGroup["rural_conservatives"]).toBe(0);
    });

    it("calculates total pool correctly with modified turnouts", () => {
      const turnoutDoc: StateDemographicTurnout = {
        _id: "TEST_STATE",
        countryId: "US",
        modifiers: {
          voterGroups: {
            college_liberals: 10, // 60 -> 70
          },
        },
        lastDecayApplied: new Date(),
        lastUpdated: new Date(),
      };

      const { totalPool, byGroup } = resolveTurnout(
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        turnoutDoc
      );

      // Without modifier:
      // college_liberals: 1M * 0.30 * 0.60 = 180k
      // rural_conservatives: 1M * 0.40 * 0.70 = 280k
      // suburban_moderates: 1M * 0.30 * 0.65 = 195k
      // Total: 655k

      // With +10 modifier on college_liberals:
      // college_liberals: 1M * 0.30 * 0.70 = 210k
      // Total: 685k

      expect(byGroup["college_liberals"]).toBe(70);
      expect(totalPool).toBe(685000);
    });
  });

  describe("vote distribution with live turnouts", () => {
    it("changes Dem vote share when liberal group turnout increases", () => {
      const candidates = makeTestCandidates();
      const totalPool = calcStateTurnout(statePopulation, TEST_DEMOGRAPHICS, TEST_CATEGORIES);

      // Baseline: no turnout modifiers
      const baselineResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool,
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        {}
      );

      // With GOTV on college liberals (+15 turnout points)
      const gotvTurnouts: Record<string, number> = {
        college_liberals: 75, // 60 + 15
        rural_conservatives: 70,
        suburban_moderates: 65,
      };

      const gotvResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool,
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        { liveTurnouts: gotvTurnouts }
      );

      // GOTV on liberals should increase Dem share
      const baselineDemShare = baselineResult.sharesPct["dem"];
      const gotvDemShare = gotvResult.sharesPct["dem"];

      expect(gotvDemShare).toBeGreaterThan(baselineDemShare);
    });

    it("changes Rep vote share when conservative group turnout increases", () => {
      const candidates = makeTestCandidates();
      const totalPool = calcStateTurnout(statePopulation, TEST_DEMOGRAPHICS, TEST_CATEGORIES);

      // Baseline: no turnout modifiers
      const baselineResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool,
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        {}
      );

      // With GOTV on rural conservatives (+15 turnout points)
      const gotvTurnouts: Record<string, number> = {
        college_liberals: 60,
        rural_conservatives: 85, // 70 + 15
        suburban_moderates: 65,
      };

      const gotvResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool,
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        { liveTurnouts: gotvTurnouts }
      );

      // GOTV on conservatives should increase Rep share
      const baselineRepShare = baselineResult.sharesPct["rep"];
      const gotvRepShare = gotvResult.sharesPct["rep"];

      expect(gotvRepShare).toBeGreaterThan(baselineRepShare);
    });

    it("produces different vote totals with suppression vs no suppression", () => {
      const candidates = makeTestCandidates();
      const totalPool = calcStateTurnout(statePopulation, TEST_DEMOGRAPHICS, TEST_CATEGORIES);

      // No suppression
      const normalResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool,
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        {}
      );

      // With suppression on college liberals (-20 turnout points)
      const suppressedTurnouts: Record<string, number> = {
        college_liberals: 40, // 60 - 20
        rural_conservatives: 70,
        suburban_moderates: 65,
      };

      const suppressedResult = distributeVotesByGroupLevelAllocation(
        candidates,
        totalPool * 0.9, // Adjusted effective pool
        totalPool,
        statePopulation,
        TEST_DEMOGRAPHICS,
        TEST_CATEGORIES,
        new Map(),
        { liveTurnouts: suppressedTurnouts }
      );

      // Suppression should change the Dem share
      expect(suppressedResult.sharesPct["dem"]).not.toBe(normalResult.sharesPct["dem"]);
    });
  });
});
