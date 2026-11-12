import type { MinisterialOrderConfig } from "@/lib/constants/cabinetMechanicsTypes";

type OrderRow = readonly [
  id: string,
  name: string,
  description: string,
  metric: string,
  modifier: number,
  scope: "national" | "regional",
];

/**
 * Two ministerial orders per seat. Each lasts the default half year and moves
 * one metric by a few hundredths, like every other country's orders.
 */
const ROWS: Record<string, readonly [OrderRow, OrderRow]> = {
  deputy_prime_minister: [
    [
      "ca_national_address",
      "National Address",
      "Address the country on the year ahead, for a temporary boost to government approval.",
      "governmentApproval",
      0.04,
      "national",
    ],
    [
      "ca_delivery_unit",
      "Delivery Unit",
      "Stand up a cross-department delivery unit, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
  ],
  minister_of_finance: [
    [
      "ca_budget_consultations",
      "Pre-Budget Consultations",
      "Hold pre-budget consultations across the country, for a temporary boost to public trust.",
      "publicTrust",
      0.04,
      "national",
    ],
    [
      "ca_investment_tax_credit",
      "Investment Tax Credit",
      "Announce an investment tax credit, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
  ],
  minister_of_foreign_affairs: [
    [
      "ca_diplomatic_tour",
      "Diplomatic Tour",
      "Tour allied capitals to reassure partners, for a temporary boost to government approval.",
      "governmentApproval",
      0.03,
      "national",
    ],
    [
      "ca_trade_mission_support",
      "Trade Mission Support",
      "Back exporters with a coordinated foreign mission, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
  ],
  minister_of_national_defence: [
    [
      "ca_recruitment_campaign",
      "Recruitment Campaign",
      "Launch a recruitment campaign, for a temporary boost to workforce skill.",
      "workforceSkill",
      0.03,
      "national",
    ],
    [
      "ca_northern_exercise",
      "Northern Exercise",
      "Run a visible northern exercise, for a temporary boost to safety confidence.",
      "publicSafetyConfidence",
      0.03,
      "national",
    ],
  ],
  minister_of_justice: [
    [
      "ca_court_backlog_review",
      "Court Backlog Review",
      "Review the court backlog and add judges, for a temporary boost to safety confidence.",
      "publicSafetyConfidence",
      0.03,
      "national",
    ],
    [
      "ca_integrity_review",
      "Integrity Review",
      "Order a review of conflict of interest rules, for a temporary boost to government transparency.",
      "governmentTransparency",
      0.04,
      "national",
    ],
  ],
  minister_of_public_safety: [
    [
      "ca_community_policing_grants",
      "Community Policing Grants",
      "Fund community policing, for a temporary drop in the crime rate.",
      "crimeRate",
      -0.03,
      "national",
    ],
    [
      "ca_border_services_surge",
      "Border Services Surge",
      "Add border officers, for a temporary boost to safety confidence.",
      "publicSafetyConfidence",
      0.03,
      "national",
    ],
  ],
  minister_of_industry: [
    [
      "ca_innovation_challenge",
      "Innovation Challenge",
      "Open a national innovation challenge, for a temporary boost to business formation.",
      "smallBusinessFormation",
      0.04,
      "national",
    ],
    [
      "ca_supercluster_funding",
      "Supercluster Funding",
      "Fund industry clusters, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
  ],
  minister_of_international_trade: [
    [
      "ca_export_diversification",
      "Export Diversification Push",
      "Open new export markets, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
    [
      "ca_small_exporter_program",
      "Small Exporter Program",
      "Help small firms export, for a temporary boost to business formation.",
      "smallBusinessFormation",
      0.03,
      "national",
    ],
  ],
  minister_of_labour: [
    [
      "ca_apprenticeship_drive",
      "Apprenticeship Drive",
      "Fund apprenticeships, for a temporary boost to workforce skill.",
      "workforceSkill",
      0.03,
      "national",
    ],
    [
      "ca_wage_support",
      "Wage Support Pilot",
      "Pilot wage support in weak regions, for a temporary drop in poverty.",
      "povertyRate",
      -0.03,
      "regional",
    ],
  ],
  minister_of_natural_resources: [
    [
      "ca_critical_minerals_push",
      "Critical Minerals Push",
      "Speed approvals for critical minerals, for a temporary national GDP boost.",
      "gdpGrowth",
      0.03,
      "national",
    ],
    [
      "ca_clean_power_partnership",
      "Clean Power Partnership",
      "Partner with provinces on clean power, for a temporary boost to renewable energy.",
      "renewableEnergy",
      0.03,
      "national",
    ],
  ],
  minister_of_health: [
    [
      "ca_wait_time_fund",
      "Wait Time Fund",
      "Fund surgical wait time reduction, for a temporary boost to physician availability.",
      "physicianRate",
      0.03,
      "national",
    ],
    [
      "ca_health_workforce_drive",
      "Health Workforce Drive",
      "Recruit health workers from abroad, for a temporary boost to physician availability.",
      "physicianRate",
      0.03,
      "regional",
    ],
  ],
  minister_of_education_and_skills: [
    [
      "ca_tutoring_initiative",
      "Tutoring Initiative",
      "Fund tutoring in struggling schools, for a temporary boost to test performance.",
      "testPerformance",
      0.03,
      "national",
    ],
    [
      "ca_credential_recognition",
      "Credential Recognition Drive",
      "Speed recognition of foreign credentials, for a temporary boost to workforce skill.",
      "workforceSkill",
      0.03,
      "national",
    ],
  ],
  minister_of_housing: [
    [
      "ca_housing_accelerator",
      "Housing Accelerator",
      "Reward cities that approve more homes, for a temporary boost to housing completions.",
      "housingCompletionsRate",
      0.04,
      "national",
    ],
    [
      "ca_rental_supply_program",
      "Rental Supply Program",
      "Finance new rental buildings, for a temporary drop in poverty.",
      "povertyRate",
      -0.03,
      "national",
    ],
  ],
  minister_of_infrastructure: [
    [
      "ca_transit_fast_track",
      "Transit Fast Track",
      "Fast-track transit projects, for a temporary boost to transport efficiency.",
      "transportEfficiency",
      0.03,
      "national",
    ],
    [
      "ca_broadband_expansion",
      "Rural Broadband Expansion",
      "Extend rural broadband, for a temporary boost to broadband access.",
      "broadbandAccess",
      0.04,
      "national",
    ],
  ],
  minister_of_agriculture: [
    [
      "ca_farm_income_support",
      "Farm Income Support",
      "Top up farm incomes in a bad year, for a temporary national GDP boost.",
      "gdpGrowth",
      0.02,
      "national",
    ],
    [
      "ca_food_security_program",
      "Food Security Program",
      "Fund northern and rural food programs, for a temporary drop in poverty.",
      "povertyRate",
      -0.03,
      "regional",
    ],
  ],
  minister_of_environment: [
    [
      "ca_emissions_standards",
      "Emissions Standards Push",
      "Tighten emissions standards, for a temporary drop in carbon emissions.",
      "carbonEmissions",
      -0.03,
      "national",
    ],
    [
      "ca_protected_areas",
      "Protected Areas Initiative",
      "Expand protected areas, for a temporary boost to public trust.",
      "publicTrust",
      0.03,
      "national",
    ],
  ],
  minister_of_intergovernmental_affairs: [
    [
      "ca_first_ministers_meeting",
      "First Ministers Meeting",
      "Convene the premiers, for a temporary boost to public trust.",
      "publicTrust",
      0.04,
      "national",
    ],
    [
      "ca_regional_accord",
      "Regional Accord",
      "Sign an accord with a province, for a temporary boost to government approval.",
      "governmentApproval",
      0.03,
      "regional",
    ],
  ],
  government_house_leader: [
    [
      "ca_house_schedule_deal",
      "House Schedule Deal",
      "Strike a scheduling deal with opposition parties, for a temporary boost to government approval.",
      "governmentApproval",
      0.03,
      "national",
    ],
    [
      "ca_question_period_reform",
      "Question Period Reform",
      "Open question period to more accountability, for a temporary boost to government transparency.",
      "governmentTransparency",
      0.03,
      "national",
    ],
  ],
  director_of_intelligence: [
    [
      "ca_threat_assessment_briefing",
      "Threat Assessment Briefing",
      "Publish a threat assessment, for a temporary boost to safety confidence.",
      "publicSafetyConfidence",
      0.03,
      "national",
    ],
    [
      "ca_foreign_interference_review",
      "Foreign Interference Review",
      "Review foreign interference, for a temporary boost to public trust.",
      "publicTrust",
      0.03,
      "national",
    ],
  ],
};

export const CA_MINISTERIAL_ORDERS: Record<string, MinisterialOrderConfig[]> = Object.fromEntries(
  Object.entries(ROWS).map(([positionId, rows]) => [
    positionId,
    rows.map(([id, name, description, metric, modifier, scope]) => ({
      id,
      name,
      description,
      duration: 24,
      effects: [{ metric, modifier, scope }],
    })),
  ])
);
