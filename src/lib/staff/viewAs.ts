/**
 * "View as": an admin previews the Control panel as a lower role.
 *
 * Only the rendered panel changes. API routes keep checking the real role, and
 * a role below admin can never preview anything but itself.
 */
import { STAFF_ROLES, type StaffRole } from "./rules";

export const VIEW_AS_COOKIE = "ahd_control_view_as";

export const VIEW_AS_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  junior_dev: "Junior dev",
};

/** The role the panel should render for: the requested one only when an admin asked. */
export function resolveViewAs(real: StaffRole, requested: string | null | undefined): StaffRole {
  if (real !== "admin") return real;
  const hit = STAFF_ROLES.find((r) => r === requested);
  return hit ?? real;
}
