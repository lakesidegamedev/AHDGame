/** Quoted fund holdings are assets, including while trading is paused. */
export function fundPositionValue(units: number, nav: number | undefined, status?: string): number {
  if (
    status === "delisted" ||
    !Number.isFinite(units) ||
    units <= 0 ||
    nav == null ||
    !Number.isFinite(nav) ||
    nav < 0
  )
    return 0;
  return units * nav;
}
