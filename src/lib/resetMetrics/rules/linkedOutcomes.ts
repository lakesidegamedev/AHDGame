/**
 * Housing hardship, preventable mortality and public trust respond to delivered
 * outcomes as well as their own funded programs. linkedOutcomeTargets preserves
 * opening calibration; elasticities are explicit game assumptions, not survey estimates.
 */
export function linkedOutcomeTargets(input: {
  opening: Readonly<Record<string, number>>;
  current: Readonly<Record<string, number | null>>;
  policyTargets: Readonly<Record<string, number>>;
  /** Favorable condition scores, not raw percentages with conflicting polarity. */
  conditionChanges: readonly number[];
}): Record<string, number> {
  const { opening, current, policyTargets } = input;
  const out: Record<string, number> = {};
  const ratio = (id: string) => {
    const now = current[id],
      base = opening[id];
    return typeof now === "number" && Number.isFinite(now) && Number.isFinite(base) && base! > 0
      ? Math.max(0.25, Math.min(4, now / base!))
      : null;
  };
  const income = ratio("02"),
    poverty = ratio("03"),
    coverage = ratio("16"),
    delay = ratio("18");
  // Unit income elasticity: unchanged nominal payments consume less real income as purchasing power rises.
  if (income !== null && policyTargets["24"] !== undefined)
    out["24"] = Math.max(0, policyTargets["24"]! / income);
  const housing =
    out["24"] !== undefined && opening["24"]! > 0 ? out["24"]! / opening["24"]! : ratio("24");
  // Combine the two modeled channels with equal log-elasticities.
  if (poverty !== null && income !== null && policyTargets["42"] !== undefined)
    out["42"] = Math.max(0, Math.min(100, policyTargets["42"]! * Math.sqrt(poverty / income)));
  if (poverty !== null && housing !== null && policyTargets["41"] !== undefined)
    out["41"] = Math.max(0, policyTargets["41"]! * Math.sqrt(poverty * housing));
  if (coverage !== null && delay !== null && policyTargets["19"] !== undefined)
    out["19"] = Math.max(0, policyTargets["19"]! * Math.sqrt(delay / coverage));
  const changes = input.conditionChanges.filter(Number.isFinite);
  // Trust has no direct legislative bonus: only published service, livelihood and governance changes.
  if (changes.length && Number.isFinite(opening["49"]))
    out["49"] = Math.max(
      0,
      Math.min(100, opening["49"]! + changes.reduce((n, d) => n + d, 0) / changes.length)
    );
  return out;
}
