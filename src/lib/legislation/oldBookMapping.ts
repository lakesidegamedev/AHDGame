/**
 * Where each retired US and UK law type went in the one law book. Old books had
 * 7-option ladders (index 0 most left-wing); the one book has five levels per
 * program law and a rate slider per tax law. Each row names the closest new law
 * and which way the old ladder runs against the new levels:
 * - `leftHigh`: the old left end is the bigger program, so it maps high.
 * - `leftLow`: the old left end is the lighter hand, so it maps low.
 *
 * Plain data and pure functions: no database, clock or randomness.
 * Only for local singleplayer saves, which are never reset. A reset replaces
 * every such id and the residue scan fails on any that survive.
 */

export type LadderDirection = "leftHigh" | "leftLow";

export interface LawMapping {
  /** New-book law id. */
  law: string;
  direction: LadderDirection;
  /** Why this law is the closest match. */
  reason: string;
}

export interface TaxLawMapping {
  law: string;
  /** Old option index to new slider rate (a waypoint of the new slider). */
  rates: Readonly<Record<number, number>>;
  reason: string;
}

const LEFT_HIGH_LEVELS = [4, 4, 3, 2, 1, 0, 0] as const;
const LEFT_LOW_LEVELS = [0, 0, 1, 2, 3, 4, 4] as const;

/** Old 7-option index to new level 0 to 4. Out-of-range indexes clamp. */
export function levelForOldOption(index: number, direction: LadderDirection): number {
  const table = direction === "leftHigh" ? LEFT_HIGH_LEVELS : LEFT_LOW_LEVELS;
  return table[Math.max(0, Math.min(table.length - 1, index))];
}

const m = (law: string, direction: LadderDirection, reason: string): LawMapping => ({
  law,
  direction,
  reason,
});

/** Program laws, keyed by retired law type id. */
export const PROGRAM_LAW_MAPPING: Readonly<Record<string, LawMapping>> = {
  // United States: education
  us_federal_education_funding: m(
    "us.education.universalSchooling.primary",
    "leftHigh",
    "General school funding"
  ),
  us_state_education_funding: m(
    "us.education.universalSchooling.primary",
    "leftHigh",
    "General school funding"
  ),
  us_school_standards: m(
    "us.education.standards.primary",
    "leftLow",
    "Academic standards; the left end is the lighter regime"
  ),
  us_federal_science_funding: m("us.education.research.primary", "leftHigh", "Science funding"),
  us_state_higher_education: m(
    "us.education.attainment.primary",
    "leftHigh",
    "Funding for college attainment"
  ),
  us_workforce_development: m("us.education.adultSkills.primary", "leftHigh", "Job training"),
  us_state_workforce_development: m("us.education.adultSkills.primary", "leftHigh", "Job training"),
  // United States: health and pensions
  us_federal_healthcare_funding: m(
    "us.health.universalCare.primary",
    "leftHigh",
    "Public coverage"
  ),
  us_state_healthcare: m(
    "us.health.outcomes.primary",
    "leftHigh",
    "Hospital and health-system investment"
  ),
  us_medicaid: m("us.health.universalCare.primary", "leftHigh", "Public coverage for the poor"),
  us_medicaid_expansion: m(
    "us.health.universalCare.primary",
    "leftHigh",
    "Public coverage for the poor"
  ),
  us_drug_pricing_medicare: m(
    "us.health.providerChoice.primary",
    "leftLow",
    "Price controls sit at the less market-driven end"
  ),
  us_public_health: m(
    "us.health.prevention.primary",
    "leftHigh",
    "Disease control and vaccination"
  ),
  us_state_public_health: m(
    "us.health.prevention.primary",
    "leftHigh",
    "Disease control and vaccination"
  ),
  us_social_security: m("us.health.socialInsurance.primary", "leftHigh", "Old-age insurance"),
  us_food_nutrition: m("us.economy.mobility.primary", "leftHigh", "Food and income assistance"),
  us_state_food_assistance: m(
    "us.economy.mobility.primary",
    "leftHigh",
    "Food and income assistance"
  ),
  us_paid_family_leave: m(
    "us.society.womensOpportunity.primary",
    "leftHigh",
    "Family leave and childcare support"
  ),
  // United States: economy and labour
  us_minimum_wage: m(
    "us.economy.workerSecurity.primary",
    "leftHigh",
    "Wage floor and worker protections"
  ),
  us_state_minimum_wage: m(
    "us.economy.workerSecurity.primary",
    "leftHigh",
    "Wage floor and worker protections"
  ),
  us_state_labor: m("us.sec.laborManagementRelations", "leftHigh", "Bargaining rights"),
  us_federal_spending_stimulus: m(
    "us.economy.stability.primary",
    "leftHigh",
    "Counter-cyclical spending"
  ),
  us_state_spending_stimulus: m(
    "us.economy.stability.primary",
    "leftHigh",
    "Counter-cyclical spending"
  ),
  us_state_business_regulation: m(
    "us.infrastructure.development.primary",
    "leftLow",
    "Permitting and building rules; more rules is the lower level"
  ),
  // United States: infrastructure, environment, housing
  us_housing: m("us.infrastructure.publicHousing.primary", "leftHigh", "Public housing"),
  us_state_housing: m("us.infrastructure.publicHousing.primary", "leftHigh", "Public housing"),
  us_transportation: m("us.infrastructure.transit.primary", "leftHigh", "Transit investment"),
  us_state_transportation: m("us.infrastructure.transit.primary", "leftHigh", "Transit investment"),
  us_broadband_energy: m(
    "us.infrastructure.utilities.primary",
    "leftHigh",
    "Utility and network build-out"
  ),
  us_state_utilities: m(
    "us.infrastructure.utilities.primary",
    "leftHigh",
    "Utility and network build-out"
  ),
  us_clean_energy: m(
    "us.environment.conservation.primary",
    "leftHigh",
    "Pollution control and clean power"
  ),
  us_state_environment: m(
    "us.environment.conservation.primary",
    "leftHigh",
    "Pollution control and clean power"
  ),
  us_conservation: m("us.environment.stewardship.primary", "leftHigh", "Public lands"),
  us_emergency_services: m("us.sec.civilDefense", "leftHigh", "Emergency preparedness"),
  // United States: order, rights and government
  us_law_enforcement_criminal_justice: m(
    "us.order.policeStrength.primary",
    "leftLow",
    "Enforcement strength"
  ),
  us_state_policing: m("us.order.communityTrust.primary", "leftHigh", "Police oversight"),
  us_prison_rehabilitation: m("us.sec.correctionsRehabilitation", "leftHigh", "Rehabilitation"),
  us_state_prison_rehabilitation: m(
    "us.sec.correctionsRehabilitation",
    "leftHigh",
    "Rehabilitation"
  ),
  us_civics_voting_rights: m("us.governance.participation.primary", "leftHigh", "Election access"),
  us_state_voting_rights: m("us.governance.participation.primary", "leftHigh", "Election access"),
  us_government_ethics: m("us.governance.integrity.primary", "leftHigh", "Ethics enforcement"),
  us_state_government_ethics: m(
    "us.governance.integrity.primary",
    "leftHigh",
    "Ethics enforcement"
  ),
  us_legal_immigration_visas: m(
    "us.sec.immigrationNationality",
    "leftHigh",
    "Admissions; the left end admits more"
  ),
  us_border_security_enforcement: m(
    "us.sec.immigrationNationality",
    "leftLow",
    "Enforcement is the closed end of the same ladder"
  ),
  us_reproductive_rights: m(
    "us.society.demography.primary",
    "leftLow",
    "Population policy; the permissive end is the lighter hand"
  ),
  us_gun_control: m("us.order.safety.primary", "leftHigh", "Public safety measures"),
  us_media_communications: m(
    "us.sec.publicBroadcasting",
    "leftHigh",
    "Public media and ownership limits"
  ),
  us_state_media_communications: m(
    "us.sec.publicBroadcasting",
    "leftHigh",
    "Public media and ownership limits"
  ),
  us_defense_spending: m("us.defense.armedForces.primary", "leftLow", "Force size"),
  us_foreign_policy: m("us.defense.diplomacy.primary", "leftHigh", "Diplomacy"),
  us_national_service: m(
    "us.sec.reserveForces",
    "leftLow",
    "Compulsory service is the heavier end"
  ),
  senate_filibuster_rules: m(
    "us.governance.decisiveness.primary",
    "leftLow",
    "Procedure that gates decisive government"
  ),
  // United Kingdom
  uk_nhs_funding: m("uk.health.universalCare.primary", "leftHigh", "Public health service"),
  uk_social_care: m(
    "uk.sec.nationalAssistanceReform",
    "leftHigh",
    "Care and assistance for those in need"
  ),
  uk_mental_health: m("uk.health.prevention.primary", "leftHigh", "Public health programmes"),
  uk_public_health: m("uk.health.prevention.primary", "leftHigh", "Public health programmes"),
  uk_regional_health: m(
    "uk.health.outcomes.primary",
    "leftHigh",
    "Hospital and health-system investment"
  ),
  uk_tuition_fees: m("uk.sec.universityGrants", "leftHigh", "Lower fees is more public funding"),
  uk_education_standards: m("uk.education.standards.primary", "leftLow", "Academic standards"),
  uk_education_funding: m(
    "uk.education.universalSchooling.primary",
    "leftHigh",
    "General school funding"
  ),
  uk_regional_education: m(
    "uk.education.universalSchooling.primary",
    "leftHigh",
    "General school funding"
  ),
  uk_research_science: m("uk.education.research.primary", "leftHigh", "Science funding"),
  uk_regional_skills: m("uk.education.adultSkills.primary", "leftHigh", "Job training"),
  uk_workforce_development: m("uk.education.adultSkills.primary", "leftHigh", "Job training"),
  uk_fiscal_spending: m("uk.economy.stability.primary", "leftHigh", "Counter-cyclical spending"),
  uk_regional_economic_development: m(
    "uk.economy.mobility.primary",
    "leftHigh",
    "Regional economic assistance"
  ),
  uk_universal_credit: m("uk.economy.householdIncome.primary", "leftHigh", "Income support"),
  uk_state_pensions: m("uk.health.socialInsurance.primary", "leftHigh", "Old-age insurance"),
  uk_childcare: m("uk.society.womensOpportunity.primary", "leftHigh", "Childcare support"),
  uk_workers_rights: m("uk.economy.workerSecurity.primary", "leftHigh", "Worker protections"),
  uk_regional_labour: m("uk.sec.industrialRelations", "leftHigh", "Bargaining rights"),
  uk_regional_housing_support: m(
    "uk.infrastructure.publicHousing.primary",
    "leftHigh",
    "Public housing"
  ),
  uk_regional_housing_development: m(
    "uk.infrastructure.publicHousing.primary",
    "leftHigh",
    "Public housing"
  ),
  uk_housing_planning: m(
    "uk.infrastructure.development.primary",
    "leftLow",
    "Planning and permitting"
  ),
  uk_leasehold_reform: m("uk.infrastructure.ownership.primary", "leftHigh", "Home ownership rules"),
  uk_transport_rail: m(
    "uk.infrastructure.transit.primary",
    "leftHigh",
    "Rail and transit investment"
  ),
  uk_regional_transport: m(
    "uk.infrastructure.transit.primary",
    "leftHigh",
    "Rail and transit investment"
  ),
  uk_energy_grid: m(
    "uk.infrastructure.utilities.primary",
    "leftHigh",
    "Utility and network build-out"
  ),
  uk_regional_utilities: m(
    "uk.infrastructure.utilities.primary",
    "leftHigh",
    "Utility and network build-out"
  ),
  uk_digital_broadband: m(
    "uk.infrastructure.utilities.primary",
    "leftHigh",
    "Utility and network build-out"
  ),
  uk_climate_net_zero: m(
    "uk.environment.conservation.primary",
    "leftHigh",
    "Pollution control and clean power"
  ),
  uk_regional_environment: m(
    "uk.environment.conservation.primary",
    "leftHigh",
    "Pollution control and clean power"
  ),
  uk_north_sea_energy: m(
    "uk.environment.resourceDev.primary",
    "leftLow",
    "Domestic resource development"
  ),
  uk_policing_crime: m("uk.order.policeStrength.primary", "leftLow", "Enforcement strength"),
  uk_regional_policing: m("uk.order.communityTrust.primary", "leftHigh", "Police oversight"),
  uk_prison_rehabilitation: m("uk.sec.borstalPrisonReform", "leftHigh", "Rehabilitation"),
  uk_regional_justice: m("uk.order.courts.primary", "leftHigh", "Court capacity"),
  uk_drug_policy: m("uk.order.deterrence.primary", "leftLow", "Sentencing severity"),
  uk_regional_emergency_services: m(
    "uk.sec.civilDefenceCorps",
    "leftHigh",
    "Emergency preparedness"
  ),
  uk_immigration_asylum: m(
    "uk.sec.nationalityMigration",
    "leftHigh",
    "Admissions; the left end admits more"
  ),
  uk_work_visas: m(
    "uk.sec.nationalityMigration",
    "leftHigh",
    "Admissions; the left end admits more"
  ),
  uk_electoral_reform: m("uk.governance.participation.primary", "leftHigh", "Election access"),
  uk_government_ethics: m("uk.governance.integrity.primary", "leftHigh", "Ethics enforcement"),
  uk_devolution_local_powers: m(
    "uk.governance.localAutonomy.primary",
    "leftHigh",
    "Devolved powers"
  ),
  uk_regional_governance: m("uk.governance.localAutonomy.primary", "leftHigh", "Devolved powers"),
  uk_local_government_funding: m(
    "uk.governance.localAutonomy.primary",
    "leftHigh",
    "Local government funding"
  ),
  uk_bbc_public_media: m("uk.sec.broadcastingCharter", "leftHigh", "Public broadcasting"),
  uk_surveillance_privacy: m("uk.defense.security.primary", "leftLow", "Security apparatus"),
  uk_defence_spending: m("uk.defense.armedForces.primary", "leftLow", "Force size"),
  uk_trident_defence: m("uk.defense.projection.primary", "leftLow", "Strategic forces"),
  uk_foreign_policy: m("uk.defense.diplomacy.primary", "leftHigh", "Diplomacy"),
  uk_agriculture_policy: m("uk.sec.agricultureDeficiency", "leftHigh", "Farm support"),
  uk_regional_agriculture: m("uk.sec.agricultureDeficiency", "leftHigh", "Farm support"),
  uk_technology_policy: m("uk.economy.productivity.primary", "leftHigh", "Industrial investment"),
  uk_regional_technology: m("uk.economy.productivity.primary", "leftHigh", "Industrial investment"),
  uk_national_service: m(
    "uk.sec.nationalServiceResettlement",
    "leftLow",
    "Compulsory service is the heavier end"
  ),
};

/**
 * Tax laws. The old ladders listed many rates; each retained option index maps
 * to a waypoint rate on the new slider.
 */
export const TAX_LAW_MAPPING: Readonly<Record<string, TaxLawMapping>> = {
  us_state_income_tax_rate: {
    law: "us.tax.stateIncomeTax",
    // Old ladder: 0, 2, 5, 7, 9, 12, 14, 16, 19, 22, 25 percent.
    rates: { 0: 0, 1: 2, 2: 5, 3: 5, 4: 9, 5: 9, 6: 14, 7: 14, 8: 20, 9: 20, 10: 25 },
    reason: "Same state income tax, snapped to the nearest slider waypoint",
  },
  uk_council_tax: {
    law: "uk.tax.incomeTax",
    rates: { 0: 0, 1: 24, 2: 24, 3: 36, 4: 36, 5: 46, 6: 46 },
    reason: "No local property tax in the one book; income tax is the household tax",
  },
  uk_business_rates: {
    law: "uk.tax.domesticCorporateTax",
    rates: { 0: 0, 1: 24, 2: 35, 3: 48, 4: 48, 5: 48, 6: 48 },
    reason: "No business rates in the one book; the company profits levy is the business tax",
  },
};

/** The rate option id used for tax laws in priority and similar option pickers. */
export function rateOptionId(rate: number): string {
  return `rate_${rate}`;
}

export interface MappedOption {
  lawTypeId: string;
  policyOptionId: string;
  /** Present for program laws. */
  level?: number;
  /** Present for tax laws. */
  rate?: number;
}

const OPTION_INDEX = /_opt_(\d+)$/;

/** Map a retired law option reference to the new law and level, or null if the law has no home. */
export function mapOldOption(oldLawId: string, oldOptionId: string): MappedOption | null {
  const match = OPTION_INDEX.exec(oldOptionId);
  if (!match) return null;
  const index = Number(match[1]);
  const program = PROGRAM_LAW_MAPPING[oldLawId];
  if (program) {
    const level = levelForOldOption(index, program.direction);
    return { lawTypeId: program.law, policyOptionId: `l${level}`, level };
  }
  const tax = TAX_LAW_MAPPING[oldLawId];
  if (tax) {
    const rate =
      tax.rates[Math.max(0, Math.min(Math.max(...Object.keys(tax.rates).map(Number)), index))];
    return { lawTypeId: tax.law, policyOptionId: rateOptionId(rate), rate };
  }
  return null;
}

export interface PriorityReferenceLike {
  lawTypeId: string;
  policyOptionId: string;
}

export interface PrioritySelectionLike {
  primary: PriorityReferenceLike;
  secondary: [PriorityReferenceLike, PriorityReferenceLike, PriorityReferenceLike];
}

export type PriorityMigration =
  | { kind: "unchanged" }
  | { kind: "migrated"; selection: PrioritySelectionLike }
  | { kind: "unusable" };

/**
 * Re-point a saved priority selection at the one law book. A reference that
 * already names a new-book law is kept; one that cannot be mapped, or a result
 * that names the same law twice, makes the whole selection unusable.
 */
export function migratePrioritySelection(selection: PrioritySelectionLike): PriorityMigration {
  const refs = [selection.primary, ...selection.secondary];
  let changed = false;
  const mapped: PriorityReferenceLike[] = [];
  for (const ref of refs) {
    if (!(ref.lawTypeId in PROGRAM_LAW_MAPPING) && !(ref.lawTypeId in TAX_LAW_MAPPING)) {
      if (/^(us|uk)_/.test(ref.lawTypeId)) return { kind: "unusable" };
      mapped.push(ref);
      continue;
    }
    const next = mapOldOption(ref.lawTypeId, ref.policyOptionId);
    if (!next) return { kind: "unusable" };
    mapped.push({ lawTypeId: next.lawTypeId, policyOptionId: next.policyOptionId });
    changed = true;
  }
  if (!changed) return { kind: "unchanged" };
  if (new Set(mapped.map((r) => r.lawTypeId)).size !== mapped.length) return { kind: "unusable" };
  return {
    kind: "migrated",
    selection: {
      primary: mapped[0],
      secondary: [mapped[1], mapped[2], mapped[3]],
    },
  };
}
