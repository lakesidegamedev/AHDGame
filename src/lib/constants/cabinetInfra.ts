/** Forwarder: tables in cabinetInfraTables, rules in the cabinet rules module. */

export * from "./cabinetInfraTables";
export {
  buildFundingDef,
  getInfraArchetype,
  availableInfraArchetypes,
  resolveInfraPosition,
  effectiveOutput,
  turnsRemaining,
  progressPct,
  aggregateInfra,
} from "@/lib/cabinet/rules/infra";
