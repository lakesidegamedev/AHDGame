/**
 * The three state redistricting levers. They are mechanical who-may-draw
 * switches read by id from `statePolicies` (see `src/lib/redistricting/caps.ts`),
 * not metric-moving programs, so they stay outside the political law book.
 */
import type { LegislationType } from "@/lib/db/types";
import { policyOptions } from "./policyOptionHelpers";

function weightedTargets(
  primary: { category: string; metric: string },
  secondary: { category: string; metric: string; weight: number }[]
): NonNullable<LegislationType["effectTargetsWeighted"]> {
  return [
    { metricCategoryId: primary.category, metricId: primary.metric, weight: 1.0 },
    ...secondary.map((s) => ({
      metricCategoryId: s.category,
      metricId: s.metric,
      weight: s.weight,
    })),
  ] as NonNullable<LegislationType["effectTargetsWeighted"]>;
}

function standardCommitteePositions(domainLabel: string): LegislationType["positions"] {
  return [
    { positionId: "house_chair", name: `Chair, House ${domainLabel} Committee`, chamber: "house" },
    {
      positionId: "house_ranking",
      name: `Ranking Member, House ${domainLabel} Committee`,
      chamber: "house",
    },
    {
      positionId: "senate_chair",
      name: `Chair, Senate ${domainLabel} Committee`,
      chamber: "senate",
    },
    {
      positionId: "senate_ranking",
      name: `Ranking Member, Senate ${domainLabel} Committee`,
      chamber: "senate",
    },
  ];
}

export const redistrictingLegislationTypes: LegislationType[] = [
  {
    _id: "us_state_redistricting_authority",
    countryScope: "us",
    name: "State Redistricting Authority Act",
    description: "Who draws the state's congressional district map",
    explanation:
      "Sets whether congressional districts are drawn by an independent commission, a bipartisan commission, or the state legislature. Only a legislature-drawn map lets a governing trifecta redraw the lines.",
    policyDomain: "governance",
    subCategory: "Elections",
    effectTarget: { metricCategoryId: "governance", metricId: "publicTrust", scope: "state" },
    effectTargetsWeighted: weightedTargets({ category: "governance", metric: "publicTrust" }, [
      { category: "governance", metric: "governmentTransparency", weight: 0.5 },
    ]),
    positions: standardCommitteePositions("Oversight"),
    policyOptions: policyOptions(
      "state_redistricting_authority",
      [
        { name: "Independent Redistricting Commission Act", stance: "left", effectDirection: 1 },
        { name: "Bipartisan Redistricting Commission Act", stance: "center", effectDirection: 0 },
        { name: "Legislative Redistricting Authority Act", stance: "right", effectDirection: -1 },
      ],
      "social"
    ).map((opt, i) => ({
      ...opt,
      explanation: [
        "An independent, nonpartisan commission draws the maps; the legislature cannot redraw, and maps are renormalized toward registration at each census.",
        "A balanced bipartisan commission draws the maps; no party can unilaterally redraw the lines.",
        "The state legislature draws the maps; a party controlling the legislature and governorship may redraw at each census.",
      ][i],
    })),
    allowedScope: "state",
  },
  {
    _id: "us_state_compactness",
    countryScope: "us",
    name: "State District Compactness Act",
    description: "How compact / non-gerrymandered individual districts must be",
    explanation:
      "Limits how far any single congressional district may deviate from the state's average partisan balance, curbing the packing of voters into lopsided districts.",
    policyDomain: "governance",
    subCategory: "Elections",
    effectTarget: { metricCategoryId: "governance", metricId: "publicTrust", scope: "state" },
    effectTargetsWeighted: weightedTargets({ category: "governance", metric: "publicTrust" }, [
      { category: "governance", metric: "governmentTransparency", weight: 0.4 },
    ]),
    positions: standardCommitteePositions("Oversight"),
    policyOptions: policyOptions(
      "state_compactness",
      [
        { name: "Strict Compactness Standard Act", stance: "left", effectDirection: 1 },
        { name: "Moderate Compactness Standard Act", stance: "center", effectDirection: 0 },
        { name: "Minimal Compactness Standard Act", stance: "right", effectDirection: -1 },
      ],
      "social"
    ).map((opt, i) => ({
      ...opt,
      explanation: [
        "Districts must hug the state average closely — no packed safe seats permitted.",
        "Districts may deviate moderately from the state average; a limited number of safe seats is allowed.",
        "Districts may deviate widely; many heavily packed safe seats are permitted.",
      ][i],
    })),
    allowedScope: "state",
  },
  {
    _id: "us_state_fairness",
    countryScope: "us",
    name: "State Electoral Fairness Act",
    description: "Statewide fairness ceiling on the district map (efficiency gap)",
    explanation:
      "Caps the statewide efficiency gap — the asymmetry in wasted votes between parties. A map exceeding the ceiling is illegal to draw and erodes public approval until corrected.",
    policyDomain: "governance",
    subCategory: "Elections",
    effectTarget: { metricCategoryId: "governance", metricId: "publicTrust", scope: "state" },
    effectTargetsWeighted: weightedTargets({ category: "governance", metric: "publicTrust" }, [
      { category: "governance", metric: "governmentTransparency", weight: 0.4 },
    ]),
    positions: standardCommitteePositions("Oversight"),
    policyOptions: policyOptions(
      "state_fairness",
      [
        { name: "Strict Electoral Fairness Act", stance: "left", effectDirection: 1 },
        { name: "Moderate Electoral Fairness Act", stance: "center", effectDirection: 0 },
        { name: "Minimal Electoral Fairness Act", stance: "right", effectDirection: -1 },
      ],
      "social"
    ).map((opt, i) => ({
      ...opt,
      explanation: [
        "A tight fairness ceiling: maps must be near-symmetric in wasted votes.",
        "A moderate fairness ceiling tolerating some partisan advantage.",
        "A loose fairness ceiling permitting substantial partisan asymmetry.",
      ][i],
    })),
    allowedScope: "state",
  },
];
