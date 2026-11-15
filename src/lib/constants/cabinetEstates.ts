/** Forwarder: tables in cabinetEstatesTables, rules in the system's rules module. */

export * from "./cabinetEstatesTables";
export {
  fundingDef,
  driftCondition,
  getPortfolioCatalog,
  getEstateArchetype,
  isAbroadSited,
  resolveEstatePortfolio,
  computeEffectiveOutput,
  computeEffectiveUpkeep,
  aggregateEstates,
} from "@/lib/cabinet/rules/estates";
