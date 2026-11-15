import type { DemographicCategory } from "@/lib/db/types";

/**
 * The United States voter archetype list. Kept free of value imports: the
 * canvassing panel reads it in the browser, while `demographicCategories.ts`
 * also carries every era's composition tables and the state position overrides.
 *
 * 12 Voter Archetypes (Phase 2 demographic overhaul)
 * Single category — mutually exclusive groups, no double-counting.
 * defaultTurnout is kept as a fallback; real derived turnout is computed in stateDemographics.
 */
export const demographicCategories: DemographicCategory[] = [
  {
    _id: "voterGroups",
    name: "Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "young_renters",
        name: "Young Renters",
        defaultEconomicLean: -4,
        defaultSocialLean: -4,
        defaultTurnout: 46, // CPS: 18-29 turnout ~45% in presidential years
      },
      {
        id: "evangelicals",
        name: "Evangelicals",
        defaultEconomicLean: 4,
        defaultSocialLean: 5,
        defaultTurnout: 73, // High organizational mobilization through churches
      },
      {
        id: "rural_traditionalists",
        name: "Rural Traditionalists",
        defaultEconomicLean: 4,
        defaultSocialLean: 4,
        defaultTurnout: 71, // Older demographic with stable civic habits
      },
      {
        id: "union_trades",
        name: "Union & Trades",
        defaultEconomicLean: -3, // Economically populist but not hard-left; shifted rightward since 2016
        // Culturally traditional: the economically-left/socially-right quadrant,
        // which is the whole reason two axes exist. Authored at -0.5 it sat on
        // the same diagonal as everything else and that quadrant was empty too.
        defaultSocialLean: 1,
        defaultTurnout: 63, // Unions actively organize GOTV
      },
      {
        id: "soccer_moms",
        name: "Soccer Moms",
        defaultEconomicLean: -1,
        defaultSocialLean: -0.5, // Suburban women are a genuine swing group
        defaultTurnout: 60,
      },
      {
        id: "college_liberals",
        name: "College Liberals",
        defaultEconomicLean: -4.5, // Very progressive but not uniformly at the ceiling
        defaultSocialLean: -5,
        defaultTurnout: 67,
      },
      {
        id: "small_business",
        name: "Small Business",
        defaultEconomicLean: 4,
        defaultSocialLean: 2,
        defaultTurnout: 72,
      },
      {
        id: "public_sector",
        name: "Public Sector Workers",
        defaultEconomicLean: -3,
        defaultSocialLean: -3,
        defaultTurnout: 67,
      },
      {
        id: "retirees",
        name: "Retirees",
        defaultEconomicLean: 1, // Consistently center-right; Medicare/SS recipients but net tax-cutters
        defaultSocialLean: 2, // More socially conservative than national average across all states
        defaultTurnout: 76, // Highest-turnout cohort; CPS: 65+ at 76-78%
      },
      {
        id: "libertarians",
        name: "Libertarians",
        defaultEconomicLean: 5,
        // Socially PERMISSIVE, not conservative — this is the defining
        // economically-right/socially-left quadrant. It was authored at +1,
        // which put it on the same diagonal as every other group and left that
        // quadrant empty.
        defaultSocialLean: -3,
        defaultTurnout: 68,
      },
      {
        id: "new_immigrants",
        name: "New Americans",
        defaultEconomicLean: -3,
        defaultSocialLean: -2,
        defaultTurnout: 42, // Naturalization and registration barriers lower effective turnout
      },
      {
        id: "secular_professionals",
        name: "Secular Professionals",
        defaultEconomicLean: -3, // Left-leaning but not uniformly socialist; includes high earners
        defaultSocialLean: -4.5,
        defaultTurnout: 68, // Well-educated high turnout but not highest; capped below retirees
      },
    ],
  },
];
