/**
 * Reset-law funding seats at the 1991 start. An owner receives the bill's
 * allocation; it does not inherit an independent regulator's legal powers.
 * Regional laws spend from the regional budget and have no Cabinet seat.
 */
import type { LawFamilyDefinition } from "./catalog";
import { getCabinetMechanics } from "@/lib/constants/cabinetMechanics";
import { resolveDepartment } from "@/lib/cabinet/rosterEra";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

export type ResetCountry = "US" | "UK" | "JP" | "IE" | "SCO" | "WAL" | "CA";

const SEATS = {
  FIN: {
    CA: "minister_of_finance",
    US: "secretary_of_treasury",
    UK: "chancellor",
    JP: "finance_minister",
    IE: "minister_for_finance",
    SCO: "financeSecretary",
    WAL: "financeSecretary",
  },
  LAB: {
    CA: "minister_of_labour",
    US: "secretary_of_labor",
    UK: "work_secretary",
    JP: "health_minister",
    IE: "minister_for_social_protection",
    SCO: "socialJusticeSecretary",
    WAL: "socialJusticeSecretary",
  },
  ECO: {
    CA: "minister_of_industry",
    US: "secretary_of_commerce",
    UK: "business_secretary",
    JP: "economy_minister",
    IE: "minister_for_enterprise",
    SCO: "economySecretary",
    WAL: "economySecretary",
  },
  EDU: {
    CA: "minister_of_education_and_skills",
    US: "secretary_of_health",
    UK: "education_secretary",
    JP: "education_minister",
    IE: "minister_for_education",
    SCO: "educationSecretary",
    WAL: "educationSecretary",
  },
  SCI: {
    CA: "minister_of_industry",
    US: "secretary_of_commerce",
    UK: "education_secretary",
    JP: "education_minister",
    IE: "minister_for_further_higher_education",
    SCO: "educationSecretary",
    WAL: "educationSecretary",
  },
  HLT: {
    CA: "minister_of_health",
    US: "secretary_of_health",
    UK: "health_secretary",
    JP: "health_minister",
    IE: "minister_for_health",
    SCO: "healthSecretary",
    WAL: "healthSecretary",
  },
  SOC: {
    CA: "minister_of_labour",
    US: "secretary_of_health",
    UK: "work_secretary",
    JP: "health_minister",
    IE: "minister_for_social_protection",
    SCO: "socialJusticeSecretary",
    WAL: "socialJusticeSecretary",
  },
  HOU: {
    CA: "minister_of_housing",
    US: "secretary_of_hud",
    UK: "levelling_secretary",
    JP: "land_minister",
    IE: "minister_for_housing",
    SCO: "communitiesSecretary",
    WAL: "communitiesSecretary",
  },
  TRN: {
    CA: "minister_of_infrastructure",
    US: "secretary_of_transportation",
    UK: "transport_secretary",
    JP: "land_minister",
    IE: "minister_for_transport",
    SCO: "transportSecretary",
    WAL: "transportSecretary",
  },
  COM: {
    CA: "minister_of_industry",
    US: "secretary_of_commerce",
    UK: "business_secretary",
    JP: "internal_affairs_minister",
    IE: "minister_for_environment_climate",
    SCO: "netZeroSecretary",
    WAL: "netZeroSecretary",
  },
  ENE: {
    CA: "minister_of_natural_resources",
    US: "secretary_of_energy",
    UK: "business_secretary",
    JP: "economy_minister",
    IE: "minister_for_environment_climate",
    SCO: "netZeroSecretary",
    WAL: "netZeroSecretary",
  },
  ENV: {
    CA: "minister_of_environment",
    US: "secretary_of_interior",
    UK: "levelling_secretary",
    JP: "environment_minister",
    IE: "minister_for_environment_climate",
    SCO: "netZeroSecretary",
    WAL: "netZeroSecretary",
  },
  AGR: {
    CA: "minister_of_agriculture",
    US: "secretary_of_agriculture",
    UK: "agriculture_secretary",
    JP: "health_minister",
    IE: "minister_for_agriculture",
    SCO: "communitiesSecretary",
    WAL: "communitiesSecretary",
  },
  JUS: {
    CA: "minister_of_justice",
    US: "attorney_general",
    UK: "home_secretary",
    JP: "justice_minister",
    IE: "minister_for_justice",
    SCO: "justiceSecretary",
    WAL: "justiceSecretary",
  },
  GOV: {
    CA: "minister_of_intergovernmental_affairs",
    US: "attorney_general",
    UK: "first_secretary_of_state",
    JP: "internal_affairs_minister",
    IE: "minister_for_public_expenditure",
    SCO: "deputyFirstMinister",
    WAL: "deputyFirstMinister",
  },
  DEF: {
    CA: "minister_of_national_defence",
    US: "secretary_of_defense",
    UK: "defence_secretary",
    JP: "defense_minister",
    IE: "minister_for_defence",
    SCO: "defenceSecretary",
    WAL: "defenceSecretary",
  },
} as const;

export type ResetOwnerCode = keyof typeof SEATS;

export function fundingSeatForLaw(
  law: Pick<LawFamilyDefinition, "id" | "ownerCode">,
  country: ResetCountry,
  enabledSeats: ReadonlySet<string> = new Set(),
  year = 1991
): string {
  if (!(law.ownerCode in SEATS)) throw new Error(`Unknown reset owner ${law.ownerCode}`);
  const code = law.ownerCode as ResetOwnerCode;
  if (countryHasFeature("usSeeds", country)) {
    if (law.id === "L50") return year >= 2003 ? "attorney_general" : "secretary_of_treasury";
    if (code === "EDU" && enabledSeats.has("secretary_of_education")) {
      return "secretary_of_education";
    }
  }
  if (countryHasFeature("ukSeeds", country)) {
    if (code === "AGR" && year >= 2001) return "environment_secretary";
    if (law.id === "L21" || law.id === "L38") return "health_secretary";
    if (law.id === "L36") return "justice_secretary";
  }
  return SEATS[code][country];
}

/** 1991 names, including compressed game seats whose canonical label is modern. */
export function fundingNameForLaw1991(
  law: Pick<LawFamilyDefinition, "id" | "ownerCode">,
  country: ResetCountry,
  enabledSeats: ReadonlySet<string> = new Set(),
  year = 1991
): string {
  const seatId = fundingSeatForLaw(law, country, enabledSeats, year);
  if (year !== 1991) {
    const mechanics = getCabinetMechanics(country, seatId);
    if (!mechanics) throw new Error(`No Cabinet mechanics for ${country} ${seatId}`);
    return resolveDepartment(mechanics, year);
  }
  if (countryHasFeature("usSeeds", country)) {
    if (law.id === "L50") return "Department of the Treasury (ATF funding)";
    if (seatId === "secretary_of_health" && !enabledSeats.has("secretary_of_education")) {
      return "Department of Health, Education, and Welfare";
    }
  }
  if (countryHasFeature("jpSeeds", country)) {
    const labels: Record<string, string> = {
      finance_minister: "Ministry of Finance",
      health_minister: "Ministry of Health and Welfare",
      economy_minister: "Ministry of International Trade and Industry",
      education_minister: "Ministry of Education, Science and Culture",
      land_minister: law.ownerCode === "TRN" ? "Ministry of Transport" : "Ministry of Construction",
      internal_affairs_minister:
        law.ownerCode === "COM"
          ? "Ministry of Posts and Telecommunications"
          : "Ministry of Home Affairs",
      environment_minister: "Environment Agency",
      defense_minister: "Defense Agency",
      justice_minister: "Ministry of Justice",
    };
    if (labels[seatId]) return labels[seatId];
  }
  if (countryHasFeature("ukSeeds", country) && seatId === "transport_secretary")
    return "Department of Transport";
  const mechanics = getCabinetMechanics(country, seatId);
  if (!mechanics) throw new Error(`No Cabinet mechanics for ${country} ${seatId}`);
  return resolveDepartment(mechanics, 1991);
}
