import type { ScotusPresetSeed } from "./types";

/**
 * 1979 preset SCOTUS content. Seeds the Burger Court at
 * its actual 1979 composition, plus a Docket of real landmark cases from
 * 1979 through the docket cutoff (2026, "present").
 *
 * ============================================================================
 * Sign convention (documented once here; applies to every field below that
 * uses it):
 *
 * `economicLean` / `socialLean` (on `HistoricalJusticeOccupant`) and
 * `historicalMajorityDirection` (on docket cases) all share ONE sign
 * convention, matching the existing codebase scale already used by real US
 * party seed data (`src/lib/seeds/reference/politicalParties.ts`: Democratic
 * Party economicPosition -2 / socialPosition -2; Republican Party
 * economicPosition +2 / socialPosition +2) and the non-tax legislation
 * policyOptions ladder ("Convention notes" in
 * src/lib/seeds/reference/policyOptionHelpers.ts):
 *
 *   NEGATIVE (down to -5) = more liberal / left-leaning (economic axis:
 *     more interventionist/redistributive; social axis: more progressive).
 *   POSITIVE (up to +5)   = more conservative / right-leaning (economic
 *     axis: more free-market; social axis: more traditionalist).
 *
 * `historicalMajorityDirection: 1` means the real historical majority on
 * that case's tagged axis was the CONSERVATIVE side; `-1` means it was the
 * LIBERAL side. This is exactly the sign `decideCaseOutcome` compares
 * against a headcount of seated justices' `economicLean`/`socialLean` > 0
 * (conservative) vs < 0 (liberal) on the same axis, so the convention here
 * must — and does — match the seated-justice lean sign above.
 *
 * Every authored `DocketCaseEffect` below encodes the DIVERGED (alternate,
 * opposite-of-history) ruling: the policy result the Court hands down when
 * the seated majority sits on the OTHER side of the axis from
 * `historicalMajorityDirection`. `effectDirection` on each effect is copied
 * verbatim from the chosen `policyOptionId`'s own authored `effectDirection`
 * in src/lib/seeds/reference/legislationTypes.ts — NOT re-derived from the
 * lean sign above (see policyOptionHelpers.ts: an option's effectDirection
 * encodes "intervention/expansion" (+1) vs "cutback/market" (-1) on the
 * TARGET METRIC, a distinct axis from the -5..+5 ideological lean scale
 * used for the headcount).
 * ============================================================================
 *
 * Party-labeling convention: `party` follows the documented
 * `HistoricalJusticeOccupant.party` convention ("opaque identifier, same
 * convention as Character.party/NPP.party" — a stringified
 * `PoliticalParty.sequentialId`). Real justices hold no formal party
 * membership, so — matching the sibling 1953/1991 preset content tickets
 * (`src/lib/scotus/presetData/1953.ts`, `1991.ts`) and
 * `src/lib/npp/seedHistorical.ts`'s convention for other real-world,
 * non-elected historical figures with no game-native party record — this
 * uses the party of the U.S. president who nominated them, the standard
 * shorthand for describing a justice's political origin (and precisely why
 * `economicLean`/`socialLean` are authored per-justice below rather than
 * derived from `party`: several appointees below voted well outside their
 * nominating president's party, e.g. Brennan, Souter, Blackmun, and Stevens
 * were all Republican appointees who anchored the Court's liberal wing for
 * some or all of their tenures). US party sequentialIds are assigned in
 * `politicalParties.ts` seedOrder: Democratic Party = "1", Republican
 * Party = "2".
 *
 * Every occupant's succession chain is real history. Per the schema's own
 * doc comment ("first entry per seat = the preset's start year"), each
 * seat's FIRST occupant below is stamped `seatedYear: 1979` (the preset's
 * start year) regardless of their true original appointment date — that's
 * the in-game "how long have they already been serving" clock, not a claim
 * about when they were actually confirmed. Subsequent occupants use their
 * real historical seating year. By the 2026 docket cutoff, every justice
 * actually sitting in 1979 has left the bench (death or retirement);
 * several of their real successors have too — those chains are carried all
 * the way to whoever is really serving today, with `departureYear: null` /
 * `departureReason: null` on the currently-serving occupant.
 *
 * One documented approximation: `departureReason` only supports "death" |
 * "retirement" (per the schema). William Rehnquist's 1972-1986 Associate
 * Justice seat didn't end in either — he was elevated in-place to Chief
 * Justice — so that seat's transition is recorded as "retirement" (closest
 * available enum value for "left this seat"), not a literal claim he retired
 * from the Court in 1986 (he plainly didn't — see the Chief Justice seat's
 * own chain, where he continues serving until his 2005 death).
 */

const US_DEM = "1";
const US_REP = "2";

const SCOTUS_1979_SEATS: ScotusPresetSeed["seats"] = [
  {
    // Chief Justice seat.
    seatNumber: 1,
    historicalOccupants: [
      {
        key: "bergman-1979",
        name: "Walter E. Bergman",
        party: US_REP,
        economicLean: 2,
        socialLean: 3,
        seatedYear: 1979,
        departureYear: 1986,
        departureReason: "retirement",
      },
      {
        key: "renwick-cj-1986",
        name: "William H. Renwick",
        party: US_REP,
        economicLean: 4,
        socialLean: 4,
        seatedYear: 1986,
        departureYear: 2005,
        departureReason: "death",
      },
      {
        key: "rowe-2005",
        name: "Jonathan Rowe",
        party: US_REP,
        economicLean: 3,
        socialLean: 3,
        seatedYear: 2005,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Brennan's seat.
    seatNumber: 2,
    historicalOccupants: [
      {
        key: "brannigan-1979",
        name: "Walter J. Brannigan",
        party: US_REP,
        economicLean: -4,
        socialLean: -5,
        seatedYear: 1979,
        departureYear: 1990,
        departureReason: "retirement",
      },
      {
        key: "seaver-1990",
        name: "Douglas H. Seaver",
        party: US_REP,
        economicLean: -2,
        socialLean: -3,
        seatedYear: 1990,
        departureYear: 2009,
        departureReason: "retirement",
      },
      {
        key: "valdemoro-2009",
        name: "Sofia Valdemoro",
        party: US_DEM,
        economicLean: -3,
        socialLean: -4,
        seatedYear: 2009,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Stewart's seat.
    seatNumber: 3,
    historicalOccupants: [
      {
        key: "stanwick-1979",
        name: "Porter Stanwick",
        party: US_REP,
        economicLean: 1,
        socialLean: 0,
        seatedYear: 1979,
        departureYear: 1981,
        departureReason: "retirement",
      },
      {
        key: "ostrander-1981",
        name: "Susan Ostrander",
        party: US_REP,
        economicLean: 1,
        socialLean: 1,
        seatedYear: 1981,
        departureYear: 2006,
        departureReason: "retirement",
      },
      {
        key: "amato-2006",
        name: "Salvatore Amato",
        party: US_REP,
        economicLean: 4,
        socialLean: 4,
        seatedYear: 2006,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // White's seat.
    seatNumber: 4,
    historicalOccupants: [
      {
        key: "whitcomb-1979",
        name: "Raymond T. Whitcomb",
        party: US_DEM,
        economicLean: 0,
        socialLean: 1,
        seatedYear: 1979,
        departureYear: 1993,
        departureReason: "retirement",
      },
      {
        key: "sterling-1993",
        name: "Miriam Gold Sterling",
        party: US_DEM,
        economicLean: -3,
        socialLean: -5,
        seatedYear: 1993,
        departureYear: 2020,
        departureReason: "death",
      },
      {
        key: "cole-2020",
        name: "Margaret Ellison Cole",
        party: US_REP,
        economicLean: 4,
        socialLean: 5,
        seatedYear: 2020,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Marshall's seat.
    seatNumber: 5,
    historicalOccupants: [
      {
        key: "marlow-1979",
        name: "Thaddeus Marlow",
        party: US_DEM,
        economicLean: -5,
        socialLean: -5,
        seatedYear: 1979,
        departureYear: 1991,
        departureReason: "retirement",
      },
      {
        key: "thornton-1991",
        name: "Calvin Thornton",
        party: US_REP,
        economicLean: 5,
        socialLean: 5,
        seatedYear: 1991,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Blackmun's seat.
    seatNumber: 6,
    historicalOccupants: [
      {
        key: "blaylock-1979",
        name: "Henry A. Blaylock",
        party: US_REP,
        economicLean: -1,
        socialLean: -3,
        seatedYear: 1979,
        departureYear: 1994,
        departureReason: "retirement",
      },
      {
        key: "brewster-1994",
        name: "Simon Brewster",
        party: US_DEM,
        economicLean: -2,
        socialLean: -3,
        seatedYear: 1994,
        departureYear: 2022,
        departureReason: "retirement",
      },
      {
        key: "jamison-2022",
        name: "Kendra Brooks Jamison",
        party: US_DEM,
        economicLean: -3,
        socialLean: -4,
        seatedYear: 2022,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Powell's seat.
    seatNumber: 7,
    historicalOccupants: [
      {
        key: "prewitt-1979",
        name: "Leland F. Prewitt Jr.",
        party: US_REP,
        economicLean: 1,
        socialLean: 1,
        seatedYear: 1979,
        departureYear: 1987,
        departureReason: "retirement",
      },
      {
        key: "kessler-1988",
        name: "Arthur M. Kessler",
        party: US_REP,
        economicLean: 2,
        socialLean: -1,
        seatedYear: 1988,
        departureYear: 2018,
        departureReason: "retirement",
      },
      {
        key: "keegan-2018",
        name: "Bradley Keegan",
        party: US_REP,
        economicLean: 3,
        socialLean: 3,
        seatedYear: 2018,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Rehnquist's original Associate Justice seat (vacated on his 1986
    // elevation to Chief Justice — see the file-level doc comment on the
    // "retirement" departureReason approximation for that transition).
    seatNumber: 8,
    historicalOccupants: [
      {
        key: "renwick-assoc-1979",
        name: "William H. Renwick",
        party: US_REP,
        economicLean: 4,
        socialLean: 4,
        seatedYear: 1979,
        departureYear: 1986,
        departureReason: "retirement",
      },
      {
        key: "varela-1986",
        name: "Anthony Varela",
        party: US_REP,
        economicLean: 4,
        socialLean: 5,
        seatedYear: 1986,
        departureYear: 2016,
        departureReason: "death",
      },
      {
        key: "gorham-2017",
        name: "Nathan Gorham",
        party: US_REP,
        economicLean: 3,
        socialLean: 2,
        seatedYear: 2017,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
  {
    // Stevens' seat.
    seatNumber: 9,
    historicalOccupants: [
      {
        key: "stetson-1979",
        name: "Paul Stetson",
        party: US_REP,
        economicLean: -3,
        socialLean: -4,
        seatedYear: 1979,
        departureYear: 2010,
        departureReason: "retirement",
      },
      {
        key: "kaminski-2010",
        name: "Elise Kaminski",
        party: US_DEM,
        economicLean: -3,
        socialLean: -3,
        seatedYear: 2010,
        departureYear: null,
        departureReason: null,
      },
    ],
  },
];

const SCOTUS_1979_DOCKET: ScotusPresetSeed["docket"] = [
  {
    caseKey: "chevron-v-nrdc-1984",
    title: "Chevron U.S.A., Inc. v. Natural Resources Defense Council",
    axis: "economic",
    historicalMajorityDirection: -1,
    decisionYear: 1984,
    // No authored effect: the holding (judicial deference to agency
    // interpretation) is a pure administrative-law doctrine with no
    // matching legislationType/policyOption in the catalog to divert.
  },
  {
    caseKey: "texas-v-johnson-1989",
    title: "Texas v. Johnson",
    axis: "social",
    historicalMajorityDirection: -1,
    decisionYear: 1989,
    // No authored effect: flag-desecration/First Amendment protection has
    // no matching free-speech legislationType in the catalog.
  },
  {
    caseKey: "planned-parenthood-v-casey-1992",
    title: "Planned Parenthood of Southeastern Pennsylvania v. Casey",
    axis: "social",
    historicalMajorityDirection: -1,
    decisionYear: 1992,
    effect: {
      legislationTypeId: "us.society.demography.primary",
      // Diverged alternative: the Court instead overturns the right
      // outright rather than reaffirming it under the undue-burden standard.
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    caseKey: "us-v-lopez-1995",
    title: "United States v. Lopez",
    axis: "economic",
    historicalMajorityDirection: 1,
    decisionYear: 1995,
    // No authored effect: the Commerce Clause federalism holding (limiting
    // congressional power) has no matching legislationType in the catalog.
  },
  {
    caseKey: "bush-v-gore-2000",
    title: "Bush v. Gore",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2000,
    effect: {
      legislationTypeId: "us.governance.participation.primary",
      // Diverged alternative: the recount continues / election-process
      // access expands instead of the Court halting the recount.
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    caseKey: "lawrence-v-texas-2003",
    title: "Lawrence v. Texas",
    axis: "social",
    historicalMajorityDirection: -1,
    decisionYear: 2003,
    // No authored effect: striking down sodomy laws under substantive due
    // process has no matching legislationType (no LGBT-rights/privacy law)
    // in the catalog.
  },
  {
    caseKey: "dc-v-heller-2008",
    title: "District of Columbia v. Heller",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2008,
    effect: {
      legislationTypeId: "us.order.safety.primary",
      // Diverged alternative: no individual right recognized, i.e. the
      // District's handgun restrictions (and similar) stand — a real
      // gun-control tightening rather than the historical individual-right
      // holding.
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    caseKey: "citizens-united-v-fec-2010",
    title: "Citizens United v. Federal Election Commission",
    axis: "economic",
    historicalMajorityDirection: 1,
    decisionYear: 2010,
    effect: {
      legislationTypeId: "us.governance.integrity.primary",
      // Diverged alternative: campaign-finance/corporate-spending
      // restrictions are upheld and strengthened instead of struck down.
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    caseKey: "nfib-v-sebelius-2012",
    title: "National Federation of Independent Business v. Sebelius",
    axis: "economic",
    historicalMajorityDirection: -1,
    decisionYear: 2012,
    effect: {
      legislationTypeId: "us.health.universalCare.primary",
      // Diverged alternative: the ACA/Medicaid-expansion framework this
      // case upheld (mandate as tax; expansion made optional for states)
      // is instead struck down/restructured away from federal expansion.
      policyOptionId: "l0",
      effectDirection: -1,
    },
  },
  {
    caseKey: "shelby-county-v-holder-2013",
    title: "Shelby County v. Holder",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2013,
    effect: {
      legislationTypeId: "us.governance.participation.primary",
      // Diverged alternative: the Voting Rights Act preclearance formula
      // is upheld instead of struck down.
      policyOptionId: "l3",
      effectDirection: 1,
    },
  },
  {
    caseKey: "obergefell-v-hodges-2015",
    title: "Obergefell v. Hodges",
    axis: "social",
    historicalMajorityDirection: -1,
    decisionYear: 2015,
    // No authored effect: the nationwide marriage-equality holding has no
    // matching legislationType (no marriage-law lever) in the catalog.
  },
  {
    caseKey: "janus-v-afscme-2018",
    title: "Janus v. American Federation of State, County, and Municipal Employees",
    axis: "economic",
    historicalMajorityDirection: 1,
    decisionYear: 2018,
    // No authored effect: the closest legislationType (us_state_labor) is
    // allowedScope "state" only, but SCOTUS rulings are federal by design
    // (DocketCaseEffect defaults to national scope) — no federal-scope
    // public-sector-union-fees lever exists in the catalog.
  },
  {
    caseKey: "rucho-v-common-cause-2019",
    title: "Rucho v. Common Cause",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2019,
    // No authored effect: the closest legislationType
    // (us_state_redistricting_authority) is allowedScope "state" only, the
    // same national/federal-scope mismatch as Janus above.
  },
  {
    caseKey: "west-virginia-v-epa-2022",
    title: "West Virginia v. Environmental Protection Agency",
    axis: "economic",
    historicalMajorityDirection: 1,
    decisionYear: 2022,
    effect: {
      legislationTypeId: "us.environment.conservation.primary",
      // Diverged alternative: EPA's broader authority to regulate power-plant
      // emissions (and shift the generation mix) is upheld instead of
      // curbed under the major-questions doctrine.
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    caseKey: "dobbs-v-jackson-2022",
    title: "Dobbs v. Jackson Women's Health Organization",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2022,
    effect: {
      legislationTypeId: "us.society.demography.primary",
      // Diverged alternative: Roe/Casey is instead reaffirmed rather than
      // overturned.
      policyOptionId: "l0",
      effectDirection: -1,
    },
  },
  {
    caseKey: "sffa-v-harvard-2023",
    title: "Students for Fair Admissions v. Harvard",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2023,
    // No authored effect: race-conscious college admissions has no
    // matching legislationType (no admissions-policy lever) in the
    // catalog — us_federal_education_funding covers funding levels, not
    // admissions criteria.
  },
  {
    caseKey: "loper-bright-v-raimondo-2024",
    title: "Loper Bright Enterprises v. Raimondo",
    axis: "economic",
    historicalMajorityDirection: 1,
    decisionYear: 2024,
    // No authored effect: overturning Chevron deference is the same
    // administrative-law doctrine gap as the 1984 Chevron entry above —
    // no matching legislationType in the catalog.
  },
  {
    caseKey: "trump-v-united-states-2024",
    title: "Trump v. United States",
    axis: "social",
    historicalMajorityDirection: 1,
    decisionYear: 2024,
    // No authored effect: presidential-immunity-from-prosecution is a
    // separation-of-powers doctrine with no matching legislationType
    // (no executive-immunity lever) in the catalog.
  },
];

export const SCOTUS_1979_PRESET_SEED: ScotusPresetSeed = {
  seats: SCOTUS_1979_SEATS,
  docket: SCOTUS_1979_DOCKET,
};
