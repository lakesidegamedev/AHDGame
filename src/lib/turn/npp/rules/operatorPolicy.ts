/**
 * What an NPP operator may do for a corporation. One policy covers an NPP that
 * steps in for a player (autopilot, caretaker) and one that runs a corporation
 * long term (an NPP CEO, including a subsidiary's). A role's default reproduces
 * its behavior before policies existed; an owner policy overrides it per action.
 */
import type {
  CorpOperatorAction,
  CorpOperatorPermission,
  CorporationOperatorPolicy,
} from "@/lib/db/types/corporation";

export type OperatorRole = "autopilot" | "caretaker" | "npp";

export const OPERATOR_ACTIONS: readonly CorpOperatorAction[] = [
  "found",
  "grow",
  "divest",
  "retool",
  "borrow",
  "budgets",
  "dividends",
  "research",
];

/** Actions that can end as an owner advisory; `ask` on any other action means `never`. */
const ADVISABLE: ReadonlySet<CorpOperatorAction> = new Set(["divest", "research"]);

export interface OperatorPermissions {
  role: OperatorRole;
  actions: Readonly<Record<CorpOperatorAction, CorpOperatorPermission>>;
  /** Operating sector types the operator may found or grow in; null means any. */
  sectorTypes: ReadonlySet<string> | null;
  /** Countries the operator may found or grow in; null means any. */
  countryIds: ReadonlySet<string> | null;
}

export interface OperatorRoleInput {
  autopilot: boolean;
  caretaker: boolean;
  /** An AI-run corporation a parent corporation controls: its plants are the parent's. */
  ownedByParent: boolean;
}

export function operatorRole(
  input: Pick<OperatorRoleInput, "autopilot" | "caretaker">
): OperatorRole {
  if (input.autopilot) return "autopilot";
  return input.caretaker ? "caretaker" : "npp";
}

/** Behavior before policies: autopilot never borrows, retools or divests; a parent's plants stay put. */
function defaultActions(
  input: OperatorRoleInput
): Record<CorpOperatorAction, CorpOperatorPermission> {
  const base: Record<CorpOperatorAction, CorpOperatorPermission> = {
    found: "allow",
    grow: "allow",
    divest: "allow",
    retool: "allow",
    borrow: "allow",
    budgets: "allow",
    dividends: "allow",
    research: "allow",
  };
  if (input.autopilot) {
    base.divest = "ask";
    base.retool = "never";
    base.borrow = "never";
    base.research = "ask";
  } else if (input.ownedByParent) {
    base.divest = "never";
    base.retool = "never";
  }
  return base;
}

function asStringSet(values: readonly string[] | undefined): ReadonlySet<string> | null {
  if (!values || values.length === 0) return null;
  return new Set(values);
}

/** Resolve the effective permissions: owner overrides on top of the role default. */
export function resolveOperatorPermissions(
  input: OperatorRoleInput,
  policy: CorporationOperatorPolicy | undefined
): OperatorPermissions {
  const actions = defaultActions(input);
  // An autopilot owner has no advisory path for anything but divest and research.
  const canAdvise = (action: CorpOperatorAction) => input.autopilot && ADVISABLE.has(action);
  for (const action of OPERATOR_ACTIONS) {
    const chosen = policy?.actions?.[action];
    if (chosen == null) continue;
    actions[action] = chosen === "ask" && !canAdvise(action) ? "never" : chosen;
  }
  return {
    role: operatorRole(input),
    actions,
    sectorTypes: asStringSet(policy?.sectorTypes),
    countryIds: asStringSet(policy?.countryIds),
  };
}

export function operatorMay(permissions: OperatorPermissions, action: CorpOperatorAction): boolean {
  return permissions.actions[action] === "allow";
}

/** Whether the operator may found or grow in this sector type and country. */
export function operatorAllowsPlacement(
  permissions: OperatorPermissions,
  operatingSectorType: string,
  countryId: string
): boolean {
  return (
    (permissions.sectorTypes === null || permissions.sectorTypes.has(operatingSectorType)) &&
    (permissions.countryIds === null || permissions.countryIds.has(countryId))
  );
}
