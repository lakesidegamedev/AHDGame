import type { CorporateSector } from "@/lib/db/types";

/** Share a buyout over sectors by revenue (evenly when none has revenue); the parts sum to the total. */
export function splitCompensationBySector(
  sectors: ReadonlyArray<Pick<CorporateSector, "_id" | "revenue">>,
  totalAnchor: number
): Map<string, number> {
  const shares = new Map<string, number>();
  if (!(totalAnchor > 0) || sectors.length === 0) return shares;
  const totalRevenue = sectors.reduce((sum, s) => sum + Math.max(0, s.revenue ?? 0), 0);
  let allocated = 0;
  sectors.forEach((s, index) => {
    const weight =
      totalRevenue > 0 ? Math.max(0, s.revenue ?? 0) / totalRevenue : 1 / sectors.length;
    const share =
      index === sectors.length - 1
        ? Math.max(0, totalAnchor - allocated)
        : Math.round(totalAnchor * weight * 100) / 100;
    allocated += share;
    shares.set(s._id.toHexString(), share);
  });
  return shares;
}
