import type { DocketCaseAxis, DocketCaseEffect } from "@/lib/db/types/scotus";

/**
 * Authored pool of "surprise" Docket case templates: flavor-only, non-historical
 * case names/topics.
 *
 * Unlike a curated historical `DocketCase` (one authored `effect` that fires on
 * divergence from a real ruling), a surprise case has no real-world ruling to
 * diverge from. Every spawn is decided by the sitting Court's majority headcount
 * on the case's tagged axis (see `scotusSurpriseCaseTurn.ts`), which can land
 * either way, so each template carries TWO candidate effects:
 *
 *  - `positiveEffect` fires when the majority headcount is positive
 *    (right-leaning, per the shared [-5,+5] lean convention).
 *  - `negativeEffect` fires when the majority headcount is negative
 *    (left-leaning).
 *
 * No "tie" effect: an exact headcount tie is vanishingly rare and applies no
 * policy effect that turn.
 *
 * Every effect references a REAL, already-seeded `legislationTypeId`/
 * `policyOptionId` pair from `seeds/reference/legislationTypes.ts`, so a
 * surprise ruling flows through the same enactment -> metric-registry ->
 * regional-lean-drift pipeline unmodified. Effects target a deliberately mild
 * option on the usual 7-option ladder so a surprise reads as smaller than a
 * landmark historical case. `effectDirection` is kept in sync with the authored
 * option for readability only; enactment looks it up from the real type.
 */
export interface SurpriseCaseTemplate {
  /**
   * Stable key. Doubles as the synthesized `DocketCase.caseKey` and as the
   * dedup key `scotusSurpriseCaseTurn.ts` uses to make sure a template never
   * repeats within the same game (tracked via existing
   * `docketCases` rows with `isSurprise: true`).
   */
  templateKey: string;
  title: string;
  axis: DocketCaseAxis;
  positiveEffect: DocketCaseEffect;
  negativeEffect: DocketCaseEffect;
  /**
   * First year this case can plausibly be heard. Absent = always eligible.
   *
   * These are flavour names, but the flavour references real institutions, and
   * a 1953 Court hearing a solar-cartel antitrust case or suing the Secretary
   * of Homeland Affairs reads as a bug rather than as colour. Same shape as
   * `METRIC_ERA_WINDOWS` in `era/metricCatalog.ts`.
   */
  activeFrom?: number;
  /**
   * Last year this case can be heard, for defunct institutions — the Bureau of
   * the Budget became OMB in 1970, the ICC was abolished in 1995. Absent = no
   * upper bound.
   */
  activeUntil?: number;
}

/**
 * Templates eligible at a given decision year. `year` null (era clock off)
 * keeps the whole pool, so a world with no clock behaves exactly as before.
 */
export function templatesForYear(
  templates: SurpriseCaseTemplate[],
  year: number | null
): SurpriseCaseTemplate[] {
  if (year == null || !Number.isFinite(year)) return templates;
  return templates.filter(
    (t) => year >= (t.activeFrom ?? -Infinity) && year <= (t.activeUntil ?? Infinity)
  );
}

export const SURPRISE_CASE_TEMPLATES: SurpriseCaseTemplate[] = [
  {
    templateKey: "phantom-fizz-bottling-v-interstate-commerce-guild",
    title: "Phantom Fizz Bottling Co. v. Interstate Commerce Guild",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_minimum_wage",
      policyOptionId: "minimum_wage_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_minimum_wage",
      policyOptionId: "minimum_wage_opt_1",
      effectDirection: 1,
    },
    // The ICC regulated interstate carriers from 1887 until it was abolished
    // in 1995.
    activeUntil: 1995,
  },
  {
    templateKey: "great-lakes-ferry-cooperative-v-national-highway-trust",
    title: "Great Lakes Ferry Cooperative v. National Highway Trust",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_transportation",
      policyOptionId: "transportation_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_transportation",
      policyOptionId: "transportation_opt_1",
      effectDirection: 1,
    },
    // The Highway Trust Fund was created by the 1956 Federal-Aid Highway Act.
    activeFrom: 1956,
  },
  {
    templateKey: "sunbelt-solar-cartel-v-federal-power-commission",
    title: "Sunbelt Solar Cartel v. Federal Power Commission",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_clean_energy",
      policyOptionId: "clean_energy_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_clean_energy",
      policyOptionId: "clean_energy_opt_1",
      effectDirection: 1,
    },
    // A solar cartel needs a solar industry: commercial photovoltaics date to
    // the mid-1970s energy crisis. The FPC itself became FERC in 1977, so this
    // one has a narrow authentic window.
    activeFrom: 1975,
  },
  {
    templateKey: "confederated-cannery-workers-v-bureau-of-the-budget",
    title: "Confederated Cannery Workers v. Bureau of the Budget",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_federal_spending_stimulus",
      policyOptionId: "federal_spending_stimulus_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_federal_spending_stimulus",
      policyOptionId: "federal_spending_stimulus_opt_1",
      effectDirection: 1,
    },
    // The Bureau of the Budget ran from 1921 until it was reorganised into OMB
    // in 1970.
    activeUntil: 1970,
  },
  {
    templateKey: "brass-lantern-tavern-league-v-board-of-election-supervisors",
    title: "Brass Lantern Tavern League v. Board of Election Supervisors",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "us_civics_voting_rights",
      policyOptionId: "civics_voting_rights_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_civics_voting_rights",
      policyOptionId: "civics_voting_rights_opt_1",
      effectDirection: 1,
    },
  },
  {
    templateKey: "driftwood-county-sheriffs-association-v-federal-bureau-of-corrections",
    title: "Driftwood County Sheriffs' Association v. Federal Bureau of Corrections",
    axis: "social",
    // Note: this type's authored effectDirection convention is INVERTED versus
    // the other templates here (right/enforcement options are +1, left/reform
    // options are -1) — see us_law_enforcement_criminal_justice in
    // legislationTypes.ts. positiveEffect/negativeEffect still map correctly
    // to majoritySide 1/-1; only the effectDirection sign differs per type.
    positiveEffect: {
      legislationTypeId: "us_law_enforcement_criminal_justice",
      policyOptionId: "law_enforcement_criminal_justice_opt_5",
      effectDirection: 1,
    },
    negativeEffect: {
      legislationTypeId: "us_law_enforcement_criminal_justice",
      policyOptionId: "law_enforcement_criminal_justice_opt_1",
      effectDirection: -1,
    },
  },
  {
    templateKey: "moonlight-drive-in-owners-guild-v-secretary-of-homeland-affairs",
    title: "Moonlight Drive-In Owners' Guild v. Secretary of Homeland Affairs",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "us_border_security_enforcement",
      policyOptionId: "border_security_enforcement_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_border_security_enforcement",
      policyOptionId: "border_security_enforcement_opt_1",
      effectDirection: 1,
    },
    // Drive-ins are pure 1950s, but there was no Homeland department to sue
    // until 2002. The title fixes the era, not the subject.
    activeFrom: 2003,
  },
  {
    templateKey: "in-re-wandering-carnival-license-v-bureau-of-visas",
    title: "In re Wandering Carnival License v. Bureau of Visas",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "us_legal_immigration_visas",
      policyOptionId: "legal_immigration_visas_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_legal_immigration_visas",
      policyOptionId: "legal_immigration_visas_opt_1",
      effectDirection: 1,
    },
  },
  // ── Mid-century pool ───────────────────────────────────────────────────────
  // Without these, an era-filtered 1953 docket falls to five templates and only
  // two on the economic axis — the surprise-case hazard would keep drawing the
  // same handful. Each references an institution that really existed in the
  // window given.
  {
    templateKey: "tidewater-shipyard-local-v-office-of-price-stabilization",
    title: "Tidewater Shipyard Local v. Office of Price Stabilization",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_minimum_wage",
      policyOptionId: "minimum_wage_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_minimum_wage",
      policyOptionId: "minimum_wage_opt_1",
      effectDirection: 1,
    },
    // The OPS ran Korean War wage and price controls from 1950 until it was
    // wound down in 1953; litigation over its orders ran a little past it.
    activeUntil: 1956,
  },
  {
    templateKey: "consolidated-rail-brotherhood-v-reconstruction-finance-corporation",
    title: "Consolidated Rail Brotherhood v. Reconstruction Finance Corporation",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "us_transportation",
      policyOptionId: "transportation_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_transportation",
      policyOptionId: "transportation_opt_1",
      effectDirection: 1,
    },
    // The RFC lent to railroads from 1932 until Congress abolished it in 1957.
    activeUntil: 1957,
  },
  {
    templateKey: "emporia-civic-league-v-county-registrar-of-voters",
    title: "Emporia Civic League v. County Registrar of Voters",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "us_civics_voting_rights",
      policyOptionId: "civics_voting_rights_opt_5",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "us_civics_voting_rights",
      policyOptionId: "civics_voting_rights_opt_1",
      effectDirection: 1,
    },
    // County registrars held the discretion this case turns on until the 1965
    // Voting Rights Act put covered jurisdictions under federal preclearance.
    activeUntil: 1968,
  },
];
