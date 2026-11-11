/** Cuts move rightward and hikes leftward, scaled to the legal rate range. */
export function taxSliderNpcEconomic(
  taxSlider: { minRate: number; maxRate: number },
  currentRate: number,
  proposedRate: number
): number {
  const scale = (taxSlider.maxRate - taxSlider.minRate) / 10;
  if (scale <= 0) return 0;
  const force = (currentRate - proposedRate) / scale;
  return Math.max(-5, Math.min(5, force));
}
