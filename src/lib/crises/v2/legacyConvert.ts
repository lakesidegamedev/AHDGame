import type {
  CrisisDecisionNode,
  CrisisDecisionOption,
  CrisisTemplate,
} from "@/lib/db/types/crisis";
import { LEGACY_STORED_EFFECTS_MODULE_ID } from "./effectModule";
import { SCRIPTED_REFERENCE_SEVERITY, scriptedStageRules } from "./scriptedPacing";
import type { CrisisDefinition, CrisisLeverDef, CrisisRole, CrisisScope } from "./types";

/** Definition id prefix for crises converted from authored templates. */
export const LEGACY_DEFINITION_PREFIX = "legacy:";

/** Id for a template that has no registry key, e.g. one built from a campaign event. */
export const AD_HOC_TEMPLATE_KEY = "adhoc";

const NODE_ROLE_TO_CRISIS_ROLE: Partial<
  Record<CrisisDecisionNode["requiredRoles"][number], CrisisRole>
> = {
  headOfState: "headOfState",
  stateGovernor: "stateGovernor",
  centralBankChair: "centralBankChair",
  financeMinister: "financeMinister",
  partyLeader: "partyLeader",
};

const SCOPE_BY_TEMPLATE_SCOPE: Record<CrisisTemplate["scope"], CrisisScope> = {
  region: "state",
  country: "national",
  global: "global",
};

/** Severity points an option removes, sized by the turns its authored text promises. */
const BASE_LEVER_MITIGATION = 2;
const MITIGATION_PER_REDUCED_TURN = 2;
const MAX_LEVER_MITIGATION = 12;
const MITIGATION_CAP = 25;

export function legacyDefinitionId(templateKey: string): string {
  return `${LEGACY_DEFINITION_PREFIX}${templateKey}`;
}

export function isLegacyDefinitionId(id: string): boolean {
  return id.startsWith(LEGACY_DEFINITION_PREFIX);
}

export function templateKeyFromDefinitionId(id: string): string | null {
  return isLegacyDefinitionId(id) ? id.slice(LEGACY_DEFINITION_PREFIX.length) : null;
}

function isDoNothing(option: CrisisDecisionOption): boolean {
  return (
    (option.durationReductionTurns ?? 0) === 0 &&
    option.effects.length === 0 &&
    !option.action &&
    !option.requiredBudget
  );
}

function optionLever(
  node: CrisisDecisionNode,
  option: CrisisDecisionOption,
  role: CrisisRole
): CrisisLeverDef {
  const reduced = option.durationReductionTurns ?? 0;
  const mitigation = Math.min(
    MAX_LEVER_MITIGATION,
    BASE_LEVER_MITIGATION + MITIGATION_PER_REDUCED_TURN * reduced
  );
  return {
    id: `${node.nodeId}.${option.optionId}`,
    role,
    label: option.label,
    mitigation,
    cost: option.requiredBudget ? { treasuryCash: option.requiredBudget } : {},
  };
}

/**
 * Choice options become levers by the office the node asks for. Aid and
 * collective nodes move real treasury money through the aid and pooled-target
 * paths, so they stay on those paths and get no lever. Choice nodes that ask
 * only for cabinet or "any" responder have no single office to hold the lever
 * and stay on the decision.
 */
export function leversFromDecisionTree(tree: readonly CrisisDecisionNode[]): CrisisLeverDef[] {
  const levers = new Map<string, CrisisLeverDef>();
  for (const node of tree) {
    if (node.type !== "choice") continue;
    const roles = node.requiredRoles.flatMap((r) => NODE_ROLE_TO_CRISIS_ROLE[r] ?? []);
    if (roles.length === 0) continue;
    for (const option of node.options ?? []) {
      if (isDoNothing(option)) continue;
      for (const role of new Set(roles)) {
        const lever = optionLever(node, option, role);
        levers.set(roles.length > 1 ? `${lever.id}@${role}` : lever.id, {
          ...lever,
          id: roles.length > 1 ? `${lever.id}@${role}` : lever.id,
        });
      }
    }
  }
  return [...levers.values()];
}

/**
 * Whether a lever now answers this decision option. A converted crisis is
 * answered through its levers, so the decision path must not also apply the
 * option's cost and effects.
 */
export function optionAnsweredByLever(
  tree: readonly CrisisDecisionNode[],
  nodeId: string,
  optionId: string
): boolean {
  const prefix = `${nodeId}.${optionId}`;
  return leversFromDecisionTree(tree).some(
    (lever) => lever.id === prefix || lever.id.startsWith(`${prefix}@`)
  );
}

export interface ConvertTemplateInput {
  /** Registry key, or `AD_HOC_TEMPLATE_KEY`. */
  key: string;
  template: CrisisTemplate;
  /** Authored length for the scope this definition is generated for. */
  durationTurns: number | null;
  /** Reach to record on the definition. Defaults to the template's own scope. */
  scope?: CrisisTemplate["scope"];
}

/**
 * Expresses an authored template as a scripted Crisis v2 definition. The
 * stored effects keep running through the legacy writers at their authored
 * size, the length maps onto stage rules, and the decision tree becomes levers.
 * Severity holds at its reference while nobody acts, so unattended content
 * plays as authored; levers ease it and the effects scale down with it.
 */
export function convertLegacyTemplate(input: ConvertTemplateInput): CrisisDefinition {
  const { key, template, durationTurns } = input;
  const levers = template.interactionDefinition
    ? leversFromDecisionTree(template.interactionDefinition.decisionTree)
    : [];
  return {
    id: legacyDefinitionId(key),
    source: "scripted",
    scope: SCOPE_BY_TEMPLATE_SCOPE[input.scope ?? template.scope],
    label: template.name,
    stages: scriptedStageRules(durationTurns),
    thresholds: { onset: 30, peak: 55, easing: 40, resolve: 10 },
    severity: {
      initial: SCRIPTED_REFERENCE_SEVERITY,
      drivers: [],
      mitigationCap: MITIGATION_CAP,
      actingThreshold: 1,
      inaction: { graceTurns: 100_000, perTurn: 0, growthPerTurn: 0, maxPerTurn: 0 },
    },
    levers,
    effectModules: [
      {
        moduleId: LEGACY_STORED_EFFECTS_MODULE_ID,
        params: { referenceSeverity: SCRIPTED_REFERENCE_SEVERITY },
      },
    ],
    spillover: [],
    scarRules: [],
    forcedEvents: [],
    pacing: { kind: "scripted", durationTurns },
  };
}
