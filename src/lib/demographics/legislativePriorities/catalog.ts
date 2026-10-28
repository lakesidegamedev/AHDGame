/**
 * Electorate legislative priorities. Authored group interests and regional
 * emphasis determine which exact law levels appear on the strategy board;
 * see resolveLegislativePriorities in rules.ts. These have no electoral effects.
 */

export interface PriorityReference {
  lawTypeId: string;
  policyOptionId: string;
}

export type PriorityTopic =
  | "housing"
  | "tuition"
  | "schools"
  | "health"
  | "pensions"
  | "care"
  | "wages"
  | "labor"
  | "skills"
  | "family"
  | "transport"
  | "environment"
  | "business"
  | "tax"
  | "rights"
  | "immigration"
  | "rural"
  | "disaster"
  | "research"
  | "devolution";

interface PriorityCountry {
  topics: Partial<Record<PriorityTopic, PriorityReference>>;
  groups: Record<string, readonly PriorityTopic[]>;
  regions: Record<string, readonly PriorityTopic[]>;
}

// Explicit option ids, not array indices: reordering a law's ladder must not
// silently change what a group wants. Names are resolved from the law catalog.
function ref(lawTypeId: string, policyOptionId: string): PriorityReference {
  return { lawTypeId, policyOptionId };
}

const commonGroups: Record<string, readonly PriorityTopic[]> = {
  "age:young": ["housing", "tuition", "wages", "labor", "transport", "environment"],
  "age:mid": ["family", "schools", "housing", "tax", "labor", "transport"],
  "age:mature": ["health", "pensions", "tax", "skills", "care", "transport"],
  "age:senior": ["pensions", "care", "health", "tax", "transport", "disaster"],
  "income:low": ["wages", "housing", "health", "skills", "transport", "labor"],
  "income:middle": ["tax", "schools", "family", "health", "housing", "transport"],
  "income:high": ["tax", "business", "research", "schools", "transport", "environment"],
};

const practicalEducation: readonly PriorityTopic[] = [
  "skills",
  "wages",
  "health",
  "labor",
  "transport",
  "schools",
];
const higherEducation: readonly PriorityTopic[] = [
  "tuition",
  "research",
  "housing",
  "environment",
  "transport",
  "rights",
];
const postgraduate: readonly PriorityTopic[] = [
  "research",
  "tuition",
  "environment",
  "rights",
  "health",
  "transport",
];

/** Design content, not a claim about every individual within a demographic. */
export const PRIORITY_COUNTRIES: Record<string, PriorityCountry> = {
  US: {
    topics: {
      housing: ref("us_state_housing", "state_housing_opt_1"),
      tuition: ref("us_state_higher_education", "state_higher_education_opt_1"),
      schools: ref("us_state_education_funding", "state_education_funding_opt_2"),
      health: ref("us_state_healthcare", "state_healthcare_opt_2"),
      pensions: ref("us_social_security", "social_security_opt_2"),
      care: ref("us_medicaid", "medicaid_opt_2"),
      wages: ref("us_state_minimum_wage", "state_minimum_wage_opt_2"),
      labor: ref("us_state_labor", "state_labor_opt_1"),
      skills: ref("us_state_workforce_development", "state_workforce_development_opt_2"),
      family: ref("us_paid_family_leave", "paid_family_leave_opt_2"),
      transport: ref("us_state_transportation", "state_transportation_opt_2"),
      environment: ref("us_state_environment", "state_environment_opt_2"),
      business: ref("us_state_business_regulation", "state_business_regulation_opt_3"),
      tax: ref("us_state_income_tax_rate", "state_income_tax_rate_opt_2"),
      rights: ref("us_civics_voting_rights", "civics_voting_rights_opt_1"),
      immigration: ref("us_legal_immigration_visas", "legal_immigration_visas_opt_2"),
      rural: ref("us_food_nutrition", "food_nutrition_opt_2"),
      disaster: ref("us_emergency_services", "emergency_services_opt_2"),
      research: ref("us_federal_science_funding", "federal_science_funding_opt_2"),
    },
    groups: {
      ...commonGroups,
      "race:white": ["health", "tax", "schools", "pensions", "rural", "transport"],
      "race:black": ["rights", "wages", "health", "housing", "skills", "schools"],
      "race:hispanic": ["immigration", "wages", "schools", "housing", "health", "family"],
      "race:asian": ["schools", "immigration", "research", "business", "housing", "transport"],
      "race:other": ["rights", "health", "schools", "housing", "environment", "transport"],
      "education:no_college": practicalEducation,
      "education:college": higherEducation,
      "education:graduate": postgraduate,
      "wealth:low": commonGroups["income:low"],
      "wealth:middle": commonGroups["income:middle"],
      "wealth:high": commonGroups["income:high"],
    },
    // Regional emphasis changes ordering only among a group's own interests.
    regions: {
      AL: ["health", "wages"],
      AK: ["disaster", "rural"],
      AZ: ["housing", "immigration"],
      AR: ["health", "rural"],
      CA: ["housing", "environment"],
      CO: ["environment", "housing"],
      CT: ["tax", "research"],
      DE: ["business", "health"],
      DC: ["housing", "rights"],
      FL: ["care", "disaster"],
      GA: ["transport", "business"],
      HI: ["housing", "disaster"],
      ID: ["rural", "tax"],
      IL: ["transport", "labor"],
      IN: ["skills", "business"],
      IA: ["rural", "schools"],
      KS: ["rural", "tax"],
      KY: ["health", "skills"],
      LA: ["disaster", "wages"],
      ME: ["care", "rural"],
      MD: ["research", "transport"],
      MA: ["research", "tuition"],
      MI: ["labor", "skills"],
      MN: ["schools", "health"],
      MS: ["health", "wages"],
      MO: ["skills", "transport"],
      MT: ["rural", "environment"],
      NE: ["rural", "schools"],
      NV: ["housing", "wages"],
      NH: ["tax", "business"],
      NJ: ["tax", "transport"],
      NM: ["schools", "rights"],
      NY: ["housing", "transport"],
      NC: ["skills", "research"],
      ND: ["rural", "transport"],
      OH: ["skills", "labor"],
      OK: ["rural", "health"],
      OR: ["environment", "housing"],
      PA: ["labor", "pensions"],
      RI: ["housing", "care"],
      SC: ["business", "skills"],
      SD: ["rural", "health"],
      TN: ["business", "tax"],
      TX: ["business", "immigration"],
      UT: ["family", "schools"],
      VT: ["environment", "care"],
      VA: ["transport", "research"],
      WA: ["housing", "research"],
      WV: ["health", "pensions"],
      WI: ["labor", "rural"],
      WY: ["rural", "tax"],
    },
  },
  UK: {
    topics: {
      housing: ref("uk_regional_housing_development", "uk_regional_housing_development_opt_1"),
      tuition: ref("uk_tuition_fees", "uk_tuition_fees_opt_1"),
      schools: ref("uk_regional_education", "uk_regional_education_opt_2"),
      health: ref("uk_nhs_funding", "uk_nhs_funding_opt_1"),
      pensions: ref("uk_state_pensions", "uk_state_pensions_opt_2"),
      care: ref("uk_social_care", "uk_social_care_opt_2"),
      wages: ref("uk_workers_rights", "uk_workers_rights_opt_2"),
      labor: ref("uk_regional_labour", "uk_regional_labour_opt_1"),
      skills: ref("uk_regional_skills", "uk_regional_skills_opt_1"),
      family: ref("uk_childcare", "uk_childcare_opt_2"),
      transport: ref("uk_regional_transport", "uk_regional_transport_opt_2"),
      environment: ref("uk_regional_environment", "uk_regional_environment_opt_2"),
      business: ref("uk_business_rates", "uk_business_rates_opt_2"),
      tax: ref("uk_council_tax", "uk_council_tax_opt_2"),
      rights: ref("uk_electoral_reform", "uk_electoral_reform_opt_2"),
      immigration: ref("uk_work_visas", "uk_work_visas_opt_2"),
      rural: ref("uk_agriculture_policy", "uk_agriculture_policy_opt_2"),
      disaster: ref("uk_regional_emergency_services", "uk_regional_emergency_services_opt_2"),
      research: ref("uk_research_science", "uk_research_science_opt_2"),
      devolution: ref("uk_devolution_local_powers", "uk_devolution_local_powers_opt_1"),
    },
    groups: {
      ...commonGroups,
      "ethnicity:white_british": ["health", "tax", "pensions", "schools", "devolution", "rural"],
      "ethnicity:asian_british": [
        "schools",
        "business",
        "health",
        "housing",
        "immigration",
        "transport",
      ],
      "ethnicity:black_british": ["housing", "wages", "rights", "health", "schools", "skills"],
      "ethnicity:mixed": ["housing", "schools", "rights", "transport", "health", "family"],
      "ethnicity:other": ["immigration", "housing", "health", "skills", "schools", "rights"],
      "education:no_qualifications": practicalEducation,
      "education:gcse_equivalent": ["skills", "labor", "wages", "housing", "health", "transport"],
      "education:a_level_equivalent": [
        "tuition",
        "skills",
        "housing",
        "family",
        "transport",
        "schools",
      ],
      "education:degree_plus": higherEducation,
    },
    regions: {
      NEE: ["skills", "health"],
      NWE: ["labor", "transport"],
      YHU: ["skills", "labor"],
      EMI: ["skills", "transport"],
      WMI: ["labor", "schools"],
      EAE: ["schools", "research"],
      LON: ["housing", "transport"],
      SEE: ["tax", "housing"],
      SWE: ["rural", "care"],
      SCO: ["devolution", "tuition"],
      WAL: ["health", "skills"],
      NIR: ["devolution", "rights"],
    },
  },
  JP: {
    topics: {
      tuition: ref("jp_university_tuition", "jp_university_tuition_opt_1"),
      schools: ref("jp_regional_education", "jp_regional_education_opt_2"),
      health: ref("jp_national_health_insurance", "jp_national_health_insurance_opt_2"),
      pensions: ref("jp_pension", "jp_pension_opt_2"),
      care: ref("jp_elder_care", "jp_elder_care_opt_2"),
      wages: ref("jp_minimum_wage", "jp_minimum_wage_opt_2"),
      labor: ref("jp_labor_reform", "jp_labor_reform_opt_1"),
      skills: ref("jp_regional_skills", "jp_regional_skills_opt_2"),
      family: ref("jp_family_policy", "jp_family_policy_opt_1"),
      transport: ref("jp_regional_transport", "jp_regional_transport_opt_2"),
      environment: ref("jp_regional_environment", "jp_regional_environment_opt_2"),
      business: ref("jp_sme_support", "jp_sme_support_opt_2"),
      tax: ref("jp_resident_tax", "jp_resident_tax_opt_3"),
      rights: ref("jp_gender_equality", "jp_gender_equality_opt_2"),
      immigration: ref("jp_visa_residency", "jp_visa_residency_opt_2"),
      rural: ref("jp_regional_agriculture", "jp_regional_agriculture_opt_2"),
      disaster: ref("jp_disaster_preparedness", "jp_disaster_preparedness_opt_1"),
      research: ref("jp_research_science", "jp_research_science_opt_2"),
      devolution: ref("jp_regional_autonomy", "jp_regional_autonomy_opt_2"),
    },
    groups: {
      // Japan's law catalog has no housing ladder. Use actual family, work and
      // transport legislation instead of inventing a housing target.
      "age:young": ["tuition", "labor", "wages", "family", "transport", "rights"],
      "age:mid": ["family", "schools", "labor", "tax", "transport", "disaster"],
      "age:mature": ["pensions", "health", "tax", "care", "skills", "disaster"],
      "age:senior": ["pensions", "care", "health", "transport", "disaster", "rural"],
      "income:low": ["wages", "health", "skills", "labor", "family", "transport"],
      "income:middle": ["tax", "family", "schools", "health", "transport", "pensions"],
      "income:high": ["tax", "business", "research", "schools", "transport", "environment"],
      "ethnicity:japanese": ["pensions", "family", "health", "disaster", "rural", "transport"],
      "ethnicity:chinese": ["immigration", "business", "schools", "labor", "health", "transport"],
      "ethnicity:korean": ["immigration", "schools", "health", "labor", "business", "transport"],
      "ethnicity:southeast_asian": ["labor", "immigration", "wages", "skills", "health", "family"],
      "ethnicity:other_foreign": [
        "immigration",
        "labor",
        "schools",
        "health",
        "transport",
        "skills",
      ],
      "education:primary_or_below": [
        "pensions",
        "care",
        "health",
        "rural",
        "transport",
        "disaster",
      ],
      "education:high_school": practicalEducation,
      "education:vocational": ["skills", "labor", "wages", "business", "transport", "health"],
      "education:university": ["tuition", "labor", "research", "family", "transport", "rights"],
      "education:graduate": postgraduate,
    },
    regions: {
      HOK: ["rural", "transport"],
      TOH: ["disaster", "rural"],
      KAN: ["family", "transport"],
      CHU: ["business", "skills"],
      KNS: ["business", "research"],
      CGK: ["care", "skills"],
      SHI: ["care", "rural"],
      KYU: ["rural", "disaster"],
    },
  },
};
