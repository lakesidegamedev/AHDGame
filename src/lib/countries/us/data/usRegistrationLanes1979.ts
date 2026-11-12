/**
 * SEED INDEPENDENCE — DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's registration builders. All values are authored for 1979
 * directly. Type-only imports are allowed.
 */

/*
 * US party registration and org seed for the 1979-default preset. Anchors to
 * the 1979 partisan landscape (Democrats organizationally dominant; Solid
 * South still Democratic by registration), NOT to the 1980 Reagan result.
 * Demographic leans stay census-honest; 1980 Reagan strength is carried by
 * PRESET_MARGINS and the presidential baseline instead. Every lane still seeds
 * a real REP org presence (org >= 18).
 *
 * US-only: non-US countries fall back to their 2019 lanes on a 1979 reset.
 */

import type { StateRegistrationSeed } from "@/lib/seeds/registration/registrationLanes";

const US_LANES_1979 = {
  strongD: {
    parties: [
      { abbr: "DEM", org: 40, reg: 60 },
      { abbr: "REP", org: 18, reg: 24 },
    ],
    independent: 9,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
  solidD: {
    parties: [
      { abbr: "DEM", org: 37, reg: 54 },
      { abbr: "REP", org: 21, reg: 30 },
    ],
    independent: 9,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
  leanD: {
    parties: [
      { abbr: "DEM", org: 34, reg: 48 },
      { abbr: "REP", org: 24, reg: 35 },
    ],
    independent: 10,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
  competitiveD: {
    parties: [
      { abbr: "DEM", org: 31, reg: 44 },
      { abbr: "REP", org: 28, reg: 40 },
    ],
    independent: 10,
    unregistered: 6,
    unaffiliatedOrg: 42,
  },
  competitiveR: {
    parties: [
      { abbr: "DEM", org: 28, reg: 40 },
      { abbr: "REP", org: 31, reg: 44 },
    ],
    independent: 10,
    unregistered: 6,
    unaffiliatedOrg: 42,
  },
  leanR: {
    parties: [
      { abbr: "DEM", org: 24, reg: 35 },
      { abbr: "REP", org: 34, reg: 48 },
    ],
    independent: 10,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
  solidR: {
    parties: [
      { abbr: "DEM", org: 21, reg: 30 },
      { abbr: "REP", org: 37, reg: 54 },
    ],
    independent: 9,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
  strongR: {
    parties: [
      { abbr: "DEM", org: 18, reg: 25 },
      { abbr: "REP", org: 40, reg: 59 },
    ],
    independent: 9,
    unregistered: 7,
    unaffiliatedOrg: 42,
  },
} as const;

// Lane assignments — bucketed by the 1979 partisan landscape (registration + org
// strength), NOT the 1980 presidential result. Democrats are structurally
// favored nationally; the GOP is strong in the Mountain West / Plains / rural NE.
const US_ASSIGNMENTS_1979: Record<keyof typeof US_LANES_1979, string[]> = {
  strongD: ["RI", "WV", "GA", "AR", "MA"],
  solidD: ["MD", "MN", "HI", "KY", "NC", "TN", "AL", "MS", "SC", "MO"],
  leanD: ["NY", "PA", "MI", "IL", "WI", "TX", "VA", "WA", "OR", "ME", "CT", "NJ"],
  competitiveD: ["OH", "IA", "NM", "FL"],
  competitiveR: ["CA", "VT", "MT", "NV", "DE", "NH"],
  leanR: ["AK", "IN", "AZ", "CO"],
  solidR: ["KS", "NE", "ND", "SD", "ID"],
  strongR: ["UT", "WY"],
};

// Per-state overrides — the ancestral-Democrat South at its registration peak,
// closed-primary / no-registration states, and large-unaffiliated states.
const US_OVERRIDES_1979: Record<string, Omit<StateRegistrationSeed, "countryId" | "stateId">> = {
  // DC: overwhelmingly Democratic.
  DC: {
    parties: [
      { abbr: "DEM", org: 45, reg: 78 },
      { abbr: "REP", org: 6, reg: 6 },
    ],
    independent: 7,
    unregistered: 9,
    unaffiliatedOrg: 50,
  },
  // LA: closed-primary registration; ~72% Democratic in 1979 (pre-1975 reforms hangover).
  LA: {
    parties: [
      { abbr: "DEM", org: 30, reg: 72 },
      { abbr: "REP", org: 26, reg: 16 },
    ],
    independent: 6,
    unregistered: 6,
    unaffiliatedOrg: 42,
  },
  // OK: ~72% Democratic registration in 1979, ancestral-D reg.
  OK: {
    parties: [
      { abbr: "DEM", org: 28, reg: 70 },
      { abbr: "REP", org: 30, reg: 24 },
    ],
    independent: 3,
    unregistered: 3,
    unaffiliatedOrg: 42,
  },
  // WV: ~63% Democratic registration in 1979.
  WV: {
    parties: [
      { abbr: "DEM", org: 30, reg: 63 },
      { abbr: "REP", org: 28, reg: 30 },
    ],
    independent: 3,
    unregistered: 4,
    unaffiliatedOrg: 42,
  },
  // KY: ~67% Democratic registration in 1979.
  KY: {
    parties: [
      { abbr: "DEM", org: 28, reg: 67 },
      { abbr: "REP", org: 30, reg: 27 },
    ],
    independent: 3,
    unregistered: 3,
    unaffiliatedOrg: 42,
  },
  // AK: large undeclared/non-partisan bloc.
  AK: {
    parties: [
      { abbr: "DEM", org: 22, reg: 26 },
      { abbr: "REP", org: 30, reg: 33 },
    ],
    independent: 28,
    unregistered: 13,
    unaffiliatedOrg: 54,
  },
  // UT: strongR with a large unaffiliated pool.
  UT: {
    parties: [
      { abbr: "DEM", org: 18, reg: 24 },
      { abbr: "REP", org: 38, reg: 47 },
    ],
    independent: 20,
    unregistered: 9,
    unaffiliatedOrg: 52,
  },
  // TX: no party registration; ancestral-D org, Republican-trending (open primary).
  TX: {
    parties: [
      { abbr: "DEM", org: 34, reg: 48 },
      { abbr: "REP", org: 26, reg: 33 },
    ],
    independent: 11,
    unregistered: 8,
    unaffiliatedOrg: 42,
  },
  // AR: no party registration; deep ancestral-D org (open primary).
  AR: {
    parties: [
      { abbr: "DEM", org: 38, reg: 56 },
      { abbr: "REP", org: 18, reg: 22 },
    ],
    independent: 12,
    unregistered: 10,
    unaffiliatedOrg: 42,
  },
};

function buildUSSeeds1979(): StateRegistrationSeed[] {
  const seeds: StateRegistrationSeed[] = [];
  for (const [lane, states] of Object.entries(US_ASSIGNMENTS_1979) as Array<
    [keyof typeof US_LANES_1979, string[]]
  >) {
    const template = US_LANES_1979[lane];
    for (const stateId of states) {
      const override = US_OVERRIDES_1979[stateId];
      seeds.push({
        countryId: "US",
        stateId,
        parties: (override ?? template).parties.map((p) => ({ ...p })),
        independent: (override ?? template).independent,
        unregistered: (override ?? template).unregistered,
        unaffiliatedOrg: (override ?? template).unaffiliatedOrg,
      });
    }
  }
  for (const [stateId, override] of Object.entries(US_OVERRIDES_1979)) {
    if (seeds.some((s) => s.stateId === stateId)) continue;
    seeds.push({
      countryId: "US",
      stateId,
      parties: override.parties.map((p) => ({ ...p })),
      independent: override.independent,
      unregistered: override.unregistered,
      unaffiliatedOrg: override.unaffiliatedOrg,
    });
  }
  return seeds;
}

/**
 * Returns the US 1979-default registration / org seed bundle.
 * US-only: non-US countries in the 1979 preset fall back to their 2019 data.
 */
export function build1979RegistrationSeeds(): StateRegistrationSeed[] {
  return buildUSSeeds1979();
}
