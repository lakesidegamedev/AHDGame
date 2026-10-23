/** Funded coverage and treatment-delay estimates use owned preparedness, never inverted legacy scores. */
export function ownedHealthAccess(input: {
  coverageTarget: number;
  delayTarget: number;
  preparedness: number;
  openingPreparedness: number;
}): { coverage: number; delay: number } | null {
  if (
    !Object.values(input).every(Number.isFinite) ||
    input.openingPreparedness <= 0 ||
    input.preparedness < 0
  )
    return null;
  // Preserve the existing 40% preparedness elasticity, normalized to the opening stock.
  const capacity = Math.pow(
    Math.max(0.25, Math.min(4, input.preparedness / input.openingPreparedness)),
    0.4
  );
  return {
    coverage: Math.max(0, Math.min(100, input.coverageTarget * capacity)),
    delay: Math.max(0, input.delayTarget / capacity),
  };
}
