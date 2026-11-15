import type { GrantableStaffRole } from "./rules";

export interface GrantTarget {
  role?: string | null;
  isAdmin?: boolean | null;
}

export type GrantPlan = { ok: true } | { ok: false; status: 400; error: string };

const ROLE_LABEL: Record<GrantableStaffRole, string> = {
  moderator: "moderator",
  junior_dev: "junior dev",
};

export function staffRoleLabel(role: GrantableStaffRole): string {
  return ROLE_LABEL[role];
}

/** Can this account be given the role? Admins and holders of any staff role are refused. */
export function planGrant(target: GrantTarget, role: GrantableStaffRole): GrantPlan {
  if (target.isAdmin === true || target.role === "admin") {
    return { ok: false, status: 400, error: `Cannot assign ${ROLE_LABEL[role]} role to an admin` };
  }
  if (target.role === role) {
    return { ok: false, status: 400, error: `User is already a ${ROLE_LABEL[role]}` };
  }
  if (target.role === "moderator" || target.role === "junior_dev") {
    return {
      ok: false,
      status: 400,
      error: `User already holds the ${target.role === "moderator" ? "moderator" : "junior dev"} role; remove it first`,
    };
  }
  return { ok: true };
}

/** Can the role be removed from this account? Only the exact role is removable. */
export function planRevoke(target: GrantTarget, role: GrantableStaffRole): GrantPlan {
  if (target.role !== role) {
    return { ok: false, status: 400, error: `User is not a ${ROLE_LABEL[role]}` };
  }
  return { ok: true };
}
