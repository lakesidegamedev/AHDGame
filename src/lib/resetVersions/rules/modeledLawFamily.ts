/** Map the modeled political-law book to one funding family per source. */
const FAMILY_BY_METRIC: Readonly<Record<string, string>> = {
  "economy.workerSecurity": "L04",
  "economy.mobility": "L06",
  "economy.householdIncome": "L01",
  "economy.stability": "L09",
  "economy.productivity": "L03",
  "economy.fiscal": "L08",
  "economy.competition": "L05",
  "education.universalSchooling": "L10",
  "education.teacherCorps": "L11",
  "education.adultSkills": "L13",
  "education.attainment": "L14",
  "education.research": "L15",
  "education.standards": "L12",
  "education.choice": "L10",
  "health.universalCare": "L16",
  "health.socialInsurance": "L02",
  "health.prevention": "L19",
  "health.outcomes": "L18",
  "health.responsibility": "L17",
  "health.providerChoice": "L16",
  "health.systemEfficiency": "L17",
  "infrastructure.publicHousing": "L22",
  "infrastructure.transit": "L26",
  "infrastructure.utilities": "L27",
  "infrastructure.condition": "L25",
  "infrastructure.highways": "L25",
  "infrastructure.ownership": "L23",
  "infrastructure.development": "L22",
  "order.dueProcess": "L36",
  "order.legalAid": "L36",
  "order.communityTrust": "L34",
  "order.safety": "L34",
  "order.courts": "L36",
  "order.policeStrength": "L34",
  "order.deterrence": "L35",
  "environment.conservation": "L31",
  "environment.stewardship": "L33",
  "environment.urbanAir": "L31",
  "environment.energySecurity": "L29",
  "environment.resourceDev": "L30",
  "environment.affordability": "L30",
  "environment.extraction": "L30",
  "society.integration": "L40",
  "society.womensOpportunity": "L40",
  "society.socialMobility": "L40",
  "society.demography": "L42",
  "society.civicLife": "L41",
  "society.familyStability": "L38",
  "society.tradition": "L41",
  "governance.participation": "L43",
  "governance.openness": "L44",
  "governance.localAutonomy": "L42",
  "governance.integrity": "L45",
  "governance.administration": "L45",
  "governance.decisiveness": "L45",
  "governance.centralAuthority": "L46",
  "defense.security": "L48",
  "defense.defenseIndustry": "L48",
  "defense.armedForces": "L48",
  "defense.projection": "L48",
};

/** Foreign affairs has no reset family: preserve it explicitly in continuity. */
export function modeledLawFamily(law: {
  id: string;
  targets: readonly { metricId: string; weight: number }[];
}): string | undefined {
  if (/\.sec\.agriculturalParity$/.test(law.id)) return "L37";
  if (/\.sec\.immigrationNationality$/.test(law.id)) return "L49";
  const target = [...law.targets].sort(
    (a, b) => b.weight - a.weight || a.metricId.localeCompare(b.metricId)
  )[0];
  return target ? FAMILY_BY_METRIC[target.metricId] : undefined;
}
