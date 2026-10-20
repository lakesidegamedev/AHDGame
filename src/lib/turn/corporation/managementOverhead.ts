/**
 * The management overhead (positive margin points) a corporation pays this
 * turn. The single read point for the margin stack and anything that wraps it
 * (for example a CEO-level discount). State-owned corporations are exempt.
 */
import type { Corporation } from "@/lib/db/types";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import type { CorporationLookups } from "./types";

export function managementOverheadPpForCorp(
  corp: Pick<Corporation, "_id" | "countryOwnerId" | "ownershipState">,
  lookups: Pick<CorporationLookups, "managementOverheadPpByCorpId">
): number {
  if (isStateOwned(corp)) return 0;
  return lookups.managementOverheadPpByCorpId?.get(corp._id.toString()) ?? 0;
}
