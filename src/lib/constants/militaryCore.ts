/** Forwarder: tables in militaryCoreTables, rules in the system's rules module. */

export * from "./militaryCoreTables";
export {
  archetypeResearchBlock,
  techPowerMult,
  techUpkeepMult,
  eqAvg,
  isMilitaryEraActive,
  getUnitTypesForYear,
  getUnitArchetype,
  postureDef,
  computeEffectivePower,
} from "@/lib/military/rules/unitModel";
