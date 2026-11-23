/** State party offices held by each person, for the national members table. */

export type StatePartyRoleKey = "chair" | "viceChair" | "treasurer";

export interface StatePartyRole {
  stateId: string;
  role: StatePartyRoleKey;
}

export interface StateOrgOfficers {
  stateId: string;
  chairId?: { toString(): string } | null;
  viceChairId?: { toString(): string } | null;
  treasurerId?: { toString(): string } | null;
}

const ROLE_FIELDS: ReadonlyArray<[keyof StateOrgOfficers, StatePartyRoleKey]> = [
  ["chairId", "chair"],
  ["viceChairId", "viceChair"],
  ["treasurerId", "treasurer"],
];

/** Person id to the state offices they hold, ordered by state then rank. */
export function stateRolesByPerson(
  orgs: readonly StateOrgOfficers[]
): Map<string, StatePartyRole[]> {
  const out = new Map<string, StatePartyRole[]>();
  for (const org of [...orgs].sort((a, b) => a.stateId.localeCompare(b.stateId))) {
    for (const [field, role] of ROLE_FIELDS) {
      const holder = org[field] as { toString(): string } | null | undefined;
      if (!holder) continue;
      const id = holder.toString();
      out.set(id, [...(out.get(id) ?? []), { stateId: org.stateId, role }]);
    }
  }
  return out;
}

const ROLE_LABEL: Record<StatePartyRoleKey, string> = {
  chair: "Chair",
  viceChair: "Vice Chair",
  treasurer: "Treasurer",
};

export function stateRoleLabel(role: StatePartyRole, regionName: string): string {
  return `${regionName} ${ROLE_LABEL[role.role]}`;
}
