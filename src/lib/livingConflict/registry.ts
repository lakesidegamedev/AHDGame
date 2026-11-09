import type { LivingConflictDef } from "./types";
import { VIETNAM_DEF } from "./defs/vietnam";
import { PANDEMIC_DEF } from "./defs/pandemic";
import { NORTHERN_IRELAND_DEF } from "./defs/northernIreland";
import { TRANSNATIONAL_TERRORISM_DEF } from "./defs/transnationalTerrorism";
import { YUGOSLAVIA_DEF } from "./defs/yugoslavia";
import { ARAB_UPRISINGS_DEF } from "./defs/arabUprisings";
import { GLOBAL_FINANCIAL_CRISIS_DEF } from "./defs/globalFinancialCrisis";
import { RUSSIA_UKRAINE_DEF } from "./defs/russiaUkraine";
import {
  BERLIN_DEF,
  CONGO_DEF,
  NUCLEAR_INCIDENT_DEF,
  OIL_DISRUPTION_DEF,
  SUEZ_AFTERMATH_DEF,
} from "./defs/globalResponseCatalog";
import { AI_LABOUR_SHOCK_DEF } from "./defs/aiLabourShock";
import { PACIFIC_STRAIT_DEF } from "./defs/pacificStrait";
import { INFRASTRUCTURE_CYBERATTACK_DEF } from "./defs/infrastructureCyberattack";
import { SECOND_PANDEMIC_DEF } from "./defs/waveFamilies/secondPandemic";
import { SOVEREIGN_DEBT_WAVE_DEF } from "./defs/waveFamilies/sovereignDebtWave";
import { GRID_CASCADE_DEF } from "./defs/waveFamilies/gridCascade";
import { CRITICAL_MINERALS_DEF } from "./defs/waveFamilies/criticalMinerals";
import { CLIMATE_MIGRATION_DEF } from "./defs/waveFamilies/climateMigration";
import { ARCTIC_OPENING_DEF } from "./defs/waveFamilies/arcticOpening";
import { ANTIMICROBIAL_RESISTANCE_DEF } from "./defs/waveFamilies/antimicrobialResistance";
import { ORBITAL_DEBRIS_DEF } from "./defs/waveFamilies/orbitalDebris";

/** Every living-conflict definition, keyed by its stable def key. */
export const LIVING_CONFLICT_DEFS: Record<string, LivingConflictDef> = {
  [VIETNAM_DEF.key]: VIETNAM_DEF,
  [PANDEMIC_DEF.key]: PANDEMIC_DEF,
  [NORTHERN_IRELAND_DEF.key]: NORTHERN_IRELAND_DEF,
  [TRANSNATIONAL_TERRORISM_DEF.key]: TRANSNATIONAL_TERRORISM_DEF,
  [YUGOSLAVIA_DEF.key]: YUGOSLAVIA_DEF,
  [ARAB_UPRISINGS_DEF.key]: ARAB_UPRISINGS_DEF,
  [GLOBAL_FINANCIAL_CRISIS_DEF.key]: GLOBAL_FINANCIAL_CRISIS_DEF,
  [RUSSIA_UKRAINE_DEF.key]: RUSSIA_UKRAINE_DEF,
  [BERLIN_DEF.key]: BERLIN_DEF,
  [CONGO_DEF.key]: CONGO_DEF,
  [SUEZ_AFTERMATH_DEF.key]: SUEZ_AFTERMATH_DEF,
  [OIL_DISRUPTION_DEF.key]: OIL_DISRUPTION_DEF,
  [NUCLEAR_INCIDENT_DEF.key]: NUCLEAR_INCIDENT_DEF,
  // Families that can open after 2027. Kept last so the stacking guard sees
  // every older conflict holding a country before rolling new hits.
  [AI_LABOUR_SHOCK_DEF.key]: AI_LABOUR_SHOCK_DEF,
  [PACIFIC_STRAIT_DEF.key]: PACIFIC_STRAIT_DEF,
  [INFRASTRUCTURE_CYBERATTACK_DEF.key]: INFRASTRUCTURE_CYBERATTACK_DEF,
  [SECOND_PANDEMIC_DEF.key]: SECOND_PANDEMIC_DEF,
  [SOVEREIGN_DEBT_WAVE_DEF.key]: SOVEREIGN_DEBT_WAVE_DEF,
  [GRID_CASCADE_DEF.key]: GRID_CASCADE_DEF,
  [CRITICAL_MINERALS_DEF.key]: CRITICAL_MINERALS_DEF,
  [CLIMATE_MIGRATION_DEF.key]: CLIMATE_MIGRATION_DEF,
  [ARCTIC_OPENING_DEF.key]: ARCTIC_OPENING_DEF,
  [ANTIMICROBIAL_RESISTANCE_DEF.key]: ANTIMICROBIAL_RESISTANCE_DEF,
  [ORBITAL_DEBRIS_DEF.key]: ORBITAL_DEBRIS_DEF,
};

export function livingConflictDef(key: string): LivingConflictDef | null {
  return LIVING_CONFLICT_DEFS[key] ?? null;
}

export function allLivingConflictDefs(): LivingConflictDef[] {
  return Object.values(LIVING_CONFLICT_DEFS);
}
