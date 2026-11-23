/**
 * Regional growth from the owned-company signal, weighted by the owned share of
 * the regional economy.
 *
 * Player and NPP companies are a slice of a region's output. Their measured
 * growth (which also counts new companies opening) moves regional GDP only in
 * proportion to that slice; the rest of the economy grows at the background
 * rate. As owned companies grow into a larger share, they drive more of it.
 */
export function shareWeightedGrowth(input: {
  ownedSignal: number;
  backgroundRate: number;
  ownedRevenue: number;
  backgroundRevenue: number;
}): number {
  const { ownedSignal, backgroundRate, ownedRevenue, backgroundRevenue } = input;
  const owned = Number.isFinite(ownedRevenue) ? Math.max(0, ownedRevenue) : 0;
  const background = Number.isFinite(backgroundRevenue) ? Math.max(0, backgroundRevenue) : 0;
  const total = owned + background;
  // No measurable economy: keep the owned signal rather than invent a share.
  if (total <= 0) return ownedSignal;
  const share = owned / total;
  return share * ownedSignal + (1 - share) * backgroundRate;
}
