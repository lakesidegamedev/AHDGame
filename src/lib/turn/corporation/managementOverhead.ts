/**
 * The management overhead (positive margin points) a corporation pays this
 * turn. The single read point for the margin stack and anything that wraps it
 * (for example a CEO-level discount). State-owned corporations are exempt.
 */
import type { Corporation } from "@/lib/db/types";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { ceoOverheadDiscountPp } from "@/lib/corporations/rules/nppCeoCareer";
import type { CorporationLookups } from "./types";

export function managementOverheadPpForCorp(
  corp: Pick<Corporation, "_id" | "countryOwnerId" | "ownershipState"> &
    Partial<Pick<Corporation, "ceoType" | "ceoPay">>,
  lookups: Pick<CorporationLookups, "managementOverheadPpByCorpId">
): number {
  if (isStateOwned(corp)) return 0;
  const pp = lookups.managementOverheadPpByCorpId?.get(corp._id.toString()) ?? 0;
  // A levelled NPP CEO runs the company more cheaply: it cuts the overhead,
  // never below zero and never by more than the career rules' cap.
  const level = corp.ceoType === "npp" ? corp.ceoPay?.level : undefined;
  return level != null ? pp - ceoOverheadDiscountPp(level, pp) : pp;
}
