import { ENERGY_STRATEGIES } from "@/lib/constants/sectorStrategies/energy";
import { MANUFACTURING_STRATEGIES } from "@/lib/constants/sectorStrategies/manufacturing";
import { TECHNOLOGY_STRATEGIES } from "@/lib/constants/sectorStrategies/technology";
import { AGRICULTURE_STRATEGIES } from "@/lib/constants/sectorStrategies/agriculture";
import { CHEMICAL_INDUSTRIES_STRATEGIES } from "@/lib/constants/sectorStrategies/chemical_industries";
import { HEALTHCARE_STRATEGIES } from "@/lib/constants/sectorStrategies/healthcare";
import { FINANCIAL_STRATEGIES } from "@/lib/constants/sectorStrategies/financial";
import { MEDIA_STRATEGIES } from "@/lib/constants/sectorStrategies/media";
import { DEFENSE_STRATEGIES } from "@/lib/constants/sectorStrategies/defense";
import { REAL_ESTATE_STRATEGIES } from "@/lib/constants/sectorStrategies/real_estate";
import { CONSTRUCTION_STRATEGIES } from "@/lib/constants/sectorStrategies/construction";
import { TELECOMMUNICATIONS_STRATEGIES } from "@/lib/constants/sectorStrategies/telecommunications";
import { RETAIL_STRATEGIES } from "@/lib/constants/sectorStrategies/retail";
import { LOGISTICS_STRATEGIES } from "@/lib/constants/sectorStrategies/logistics";
import { EXTRACTION_STRATEGIES } from "@/lib/constants/sectorStrategies/extraction";
import type { OperatingSectorType } from "./corporations";
import type { SectorStrategy } from "./sectorStrategyTypes";
import { TIER_2039_STRATEGIES } from "./sectorStrategyDefinitions2039";
import { withMethodBuildProfile } from "@/lib/corporations/rules/methodAdoption";

const BASE_SECTOR_STRATEGIES: Record<OperatingSectorType, SectorStrategy[]> = {
  energy: ENERGY_STRATEGIES,
  manufacturing: MANUFACTURING_STRATEGIES,
  technology: TECHNOLOGY_STRATEGIES,
  agriculture: AGRICULTURE_STRATEGIES,
  chemical_industries: CHEMICAL_INDUSTRIES_STRATEGIES,
  healthcare: HEALTHCARE_STRATEGIES,
  financial: FINANCIAL_STRATEGIES,
  media: MEDIA_STRATEGIES,
  defense: DEFENSE_STRATEGIES,
  real_estate: REAL_ESTATE_STRATEGIES,
  construction: CONSTRUCTION_STRATEGIES,
  telecommunications: TELECOMMUNICATIONS_STRATEGIES,
  retail: RETAIL_STRATEGIES,
  logistics: LOGISTICS_STRATEGIES,
  extraction: EXTRACTION_STRATEGIES,
};

export const SECTOR_STRATEGIES: Record<OperatingSectorType, SectorStrategy[]> = Object.fromEntries(
  Object.entries(BASE_SECTOR_STRATEGIES).map(([sector, list]) => [
    sector,
    [...list, ...(TIER_2039_STRATEGIES[sector] ?? [])].map(withMethodBuildProfile),
  ])
) as Record<OperatingSectorType, SectorStrategy[]>;
