import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import type { Corporation } from "@/lib/db/types";
import { isAutopilotRun } from "@/lib/corporations/autopilot";
import { resolveOperatorPermissions, type OperatorPermissions } from "./rules/operatorPolicy";

/** Permissions for the NPP operator of a corporation, derived from the corp document alone. */
export function operatorPermissionsFor(corp: Corporation): OperatorPermissions {
  return resolveOperatorPermissions(
    {
      autopilot: isAutopilotRun(corp),
      caretaker: !!corp.caretakerCeo,
      // Derived from the cap table like every other subsidiary fact, so it cannot
      // drift from who actually controls the corporation.
      ownedByParent:
        corp.subsidiaryFormalizedAtTurn != null && getControllingCorporateParent(corp) != null,
    },
    corp.operatorPolicy
  );
}
