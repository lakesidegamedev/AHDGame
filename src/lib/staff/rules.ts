/**
 * Staff roles and what each may do in the control panel and its APIs.
 *
 *   admin       everything
 *   moderator   the moderator-tier tools, reads and writes
 *   junior_dev  read-only view of everything admins see, including
 *               diagnostics, debug and logs. Never any state change.
 * Authority comes from the account record, never a token claim.
 */

export const STAFF_ROLES = ["admin", "moderator", "junior_dev"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles an admin may grant to or remove from another account. */
export const GRANTABLE_STAFF_ROLES = ["moderator", "junior_dev"] as const;
export type GrantableStaffRole = (typeof GRANTABLE_STAFF_ROLES)[number];

/** Which tier of tooling a route or panel tool belongs to. */
export type ToolTier = "moderator" | "admin";

export interface StaffAccountShape {
  role?: string | null;
  isAdmin?: boolean | null;
}

/** Account record to staff role. Admin wins over any other role value. */
export function resolveStaffRole(account: StaffAccountShape | null | undefined): StaffRole | null {
  if (!account) return null;
  if (account.isAdmin === true || account.role === "admin") return "admin";
  if (account.role === "moderator") return "moderator";
  if (account.role === "junior_dev") return "junior_dev";
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * True for methods that cannot change state. OPTIONS is deliberately not
 * listed: a missing or unrecognised method is treated as mutating so the
 * read-only role fails closed.
 */
export function isReadMethod(method: string | null | undefined): boolean {
  return method != null && SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Can this role call an endpoint of the given tier with the given method?
 * Moderators have exactly the moderator tier. Junior devs get reads on both
 * tiers and nothing else.
 */
export function canCallTier(
  role: StaffRole | null,
  tier: ToolTier,
  method: string | null | undefined
): boolean {
  if (role === "admin") return true;
  if (role === "moderator") return tier === "moderator";
  if (role === "junior_dev") return isReadMethod(method);
  return false;
}

/** Roles that may open the panel at all, and which tiers they can see. */
export function canViewTier(role: StaffRole | null, tier: ToolTier): boolean {
  if (role === "admin" || role === "junior_dev") return true;
  if (role === "moderator") return tier === "moderator";
  return false;
}

/** Can this role make changes in the tool at all? Drives hidden write controls. */
export function canWrite(role: StaffRole | null, tier: ToolTier): boolean {
  if (role === "admin") return true;
  if (role === "moderator") return tier === "moderator";
  return false;
}

/** Only admins grant or remove moderator and junior dev. */
export function canManageStaffRoles(role: StaffRole | null): boolean {
  return role === "admin";
}

/** Name of the request header the proxy stamps with the real HTTP method. */
export const REQUEST_METHOD_HEADER = "x-ahd-request-method";
