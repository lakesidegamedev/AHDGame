import { STAGE_INDEX, type CrisisDefinition } from "./types";

/** Authoring checks for a definition. Returns problems; empty means valid. */
export function validateCrisisDefinition(def: CrisisDefinition): string[] {
  const problems: string[] = [];
  const th = def.thresholds;

  for (const [name, value] of Object.entries(th)) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      problems.push(`threshold ${name} must be within 0..100`);
    }
  }
  if (!(th.resolve < th.easing)) problems.push("resolve must be below easing");
  if (!(th.easing < th.peak)) problems.push("easing must be below peak");
  if (!(th.onset <= th.peak)) problems.push("onset must not exceed peak");
  if (th.surge !== undefined && th.surge < th.onset) problems.push("surge must be at least onset");

  for (const [stage, rule] of Object.entries(def.stages)) {
    if (rule.minTurns < 0) problems.push(`stage ${stage} minTurns must not be negative`);
    if (rule.maxTurns !== null && rule.maxTurns < rule.minTurns) {
      problems.push(`stage ${stage} maxTurns must be at least minTurns`);
    }
  }

  const sev = def.severity;
  if (sev.initial < 0 || sev.initial > 100) problems.push("initial severity must be within 0..100");
  if (sev.mitigationCap < 0) problems.push("mitigationCap must not be negative");
  if (sev.inaction.graceTurns < 0) problems.push("inaction graceTurns must not be negative");
  if (sev.inaction.maxPerTurn < sev.inaction.perTurn) {
    problems.push("inaction maxPerTurn must be at least perTurn");
  }

  const seen = new Set<string>();
  for (const lever of def.levers) {
    if (seen.has(lever.id)) problems.push(`duplicate lever id ${lever.id}`);
    seen.add(lever.id);
    if (lever.mitigation < 0) problems.push(`lever ${lever.id} mitigation must not be negative`);
  }

  const driverIds = new Set<string>();
  for (const driver of sev.drivers) {
    if (driverIds.has(driver.id)) problems.push(`duplicate driver id ${driver.id}`);
    driverIds.add(driver.id);
  }

  for (const link of def.spillover) {
    if (link.transmission < 0 || link.transmission > 1) {
      problems.push(`spillover ${link.id} transmission must be within 0..1`);
    }
  }

  for (const rule of def.scarRules) {
    if (rule.recoveryTurns <= 0) problems.push(`scar ${rule.id} recoveryTurns must be positive`);
    if (!(rule.onStage in STAGE_INDEX)) problems.push(`scar ${rule.id} has an unknown stage`);
  }

  for (const forced of def.forcedEvents) {
    if (forced.sustainedTurns < 1)
      problems.push(`forced event ${forced.id} sustainedTurns must be at least 1`);
  }

  if (
    def.levers.some((lever) => lever.requiresEmergency) &&
    !def.forcedEvents.some((forced) => forced.event === "stateOfEmergency")
  ) {
    problems.push("emergency levers need a stateOfEmergency forced event to unlock them");
  }
  if (def.reopenCooldownTurns !== undefined && def.reopenCooldownTurns < 0) {
    problems.push("reopenCooldownTurns must not be negative");
  }

  return problems;
}
