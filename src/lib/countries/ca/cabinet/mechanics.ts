import type {
  AllocationConfig,
  CabinetPositionMechanics,
} from "@/lib/constants/cabinetMechanicsTypes";
import { CA_METRICS, type CaMetricKey } from "./metrics";

interface SeatSpec {
  department: string;
  national: readonly CaMetricKey[];
  regional: readonly CaMetricKey[];
  allocation?: AllocationConfig;
  bondProfile?: { name: string; description: string };
}

const SEATS: Record<string, SeatSpec> = {
  deputy_prime_minister: {
    department: "Privy Council Office",
    national: ["gdp", "approval", "trust", "transparency"],
    regional: ["gdp", "trust"],
  },
  minister_of_finance: {
    department: "Department of Finance",
    national: ["gdp", "jobless", "income", "cost"],
    regional: ["gdp", "jobless"],
    allocation: {
      name: "Provincial Transfers Allocation",
      description:
        "Allocate the federal transfer pool across the 13 provinces and territories. Must sum to 100%.",
      poolLabel: "Federal Transfers Pool",
    },
    bondProfile: {
      name: "Sovereign Bond Maturity Profile",
      description:
        "Set the split of quarterly sovereign debt issuance across 1-year, 2-year, and 5-year maturities.",
    },
  },
  minister_of_foreign_affairs: {
    department: "Global Affairs Canada",
    national: ["trade", "gdp", "approval", "trust"],
    regional: ["gdp"],
  },
  minister_of_national_defence: {
    department: "Department of National Defence",
    national: ["safety", "approval", "trust", "skills"],
    regional: ["safety"],
  },
  minister_of_justice: {
    department: "Department of Justice",
    national: ["crime", "violent", "safety", "corruption"],
    regional: ["crime", "safety"],
  },
  minister_of_public_safety: {
    department: "Public Safety Canada",
    national: ["crime", "violent", "safety", "resilience"],
    regional: ["crime", "violent"],
  },
  minister_of_industry: {
    department: "Innovation, Science and Economic Development",
    national: ["business", "productivity", "rd", "gdp"],
    regional: ["business", "gdp"],
  },
  minister_of_international_trade: {
    department: "Trade and Export Promotion",
    national: ["trade", "gdp", "business", "income"],
    regional: ["trade", "gdp"],
  },
  minister_of_labour: {
    department: "Employment and Social Development",
    national: ["jobless", "income", "skills", "poverty"],
    regional: ["jobless", "income"],
  },
  minister_of_natural_resources: {
    department: "Natural Resources Canada",
    national: ["gdp", "renewables", "carbon", "grid"],
    regional: ["gdp", "renewables"],
  },
  minister_of_health: {
    department: "Health Canada",
    national: ["doctors", "life", "mental", "prepared"],
    regional: ["doctors", "life"],
  },
  minister_of_education_and_skills: {
    department: "Education and Skills Canada",
    national: ["tests", "skills", "mobility", "poverty"],
    regional: ["tests", "skills"],
  },
  minister_of_housing: {
    department: "Housing, Infrastructure and Communities Canada",
    national: ["housing", "homeless", "cost", "poverty"],
    regional: ["housing", "homeless"],
  },
  minister_of_infrastructure: {
    department: "Infrastructure Canada",
    national: ["roads", "transit", "broadband", "grid"],
    regional: ["roads", "transit"],
  },
  minister_of_agriculture: {
    department: "Agriculture and Agri-Food Canada",
    national: ["food", "gdp", "income", "carbon"],
    regional: ["food", "income"],
  },
  minister_of_environment: {
    department: "Environment and Climate Change Canada",
    national: ["air", "renewables", "carbon", "resilience"],
    regional: ["air", "carbon"],
  },
  minister_of_intergovernmental_affairs: {
    department: "Intergovernmental Affairs",
    national: ["trust", "cohesion", "approval", "turnout"],
    regional: ["trust", "cohesion"],
  },
  government_house_leader: {
    department: "Office of the Government House Leader",
    national: ["approval", "trust", "turnout", "transparency"],
    regional: ["approval", "turnout"],
  },
  director_of_intelligence: {
    department: "Security Intelligence Service",
    national: ["safety", "trust", "corruption", "press"],
    regional: ["safety", "trust"],
  },
};

export const CA_CABINET_MECHANICS: Record<string, CabinetPositionMechanics> = Object.fromEntries(
  Object.entries(SEATS).map(([positionId, seat]) => [
    positionId,
    {
      positionId,
      department: seat.department,
      nationalMetrics: seat.national.map((key) => ({ ...CA_METRICS[key] })),
      regionalMetrics: seat.regional.map((key) => ({ ...CA_METRICS[key] })),
      ...(seat.allocation ? { allocation: seat.allocation } : {}),
      ...(seat.bondProfile ? { bondProfile: seat.bondProfile } : {}),
    },
  ])
);
