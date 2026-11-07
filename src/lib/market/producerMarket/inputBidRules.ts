/**
 * Producers leave room for ordinary price movement when buying inputs.
 * The last clearing price gets the same headroom as the local reference,
 * capped against that reference so a rising bid never raises its own anchor.
 */
export function producerInputBidLimit(input: {
  referenceUnitPrice: number;
  headroom: number;
  clearingUnitPrice?: number;
}): number {
  const reference = input.referenceUnitPrice;
  const ordinary = reference * input.headroom;
  const cleared = input.clearingUnitPrice;
  if (cleared == null || !Number.isFinite(cleared) || cleared <= reference) return ordinary;
  return Math.max(ordinary, Math.min(cleared * input.headroom, reference * 3));
}
