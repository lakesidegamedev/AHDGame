/** Frozen opening references let all regions improve without moving their own goalposts. */
export function performanceApproval(
  metrics: readonly { value: number; reference: number; higherBetter: boolean }[]
): number {
  const valid = metrics.filter((m) => Number.isFinite(m.value) && Number.isFinite(m.reference));
  if (!valid.length) return 50;
  const sum = valid.reduce((total, metric) => {
    const deviation = (metric.value - metric.reference) / Math.max(1, Math.abs(metric.reference));
    return total + Math.max(-2, Math.min(2, deviation * (metric.higherBetter ? 15 : -15)));
  }, 0);
  return Math.round((50 + (sum / valid.length) * 10) * 10) / 10;
}

export function fiscalApprovalModifiers(debtPct: number, balancePct: number, regional = false) {
  const debt = Number.isFinite(debtPct)
    ? regional
      ? -Math.min(25, Math.max(0, debtPct) / 10)
      : debtPct >= 115
        ? -1
        : 0
    : 0;
  const deficit = Number.isFinite(balancePct)
    ? regional
      ? -Math.min(10, Math.max(0, -balancePct))
      : balancePct <= -5
        ? -3
        : balancePct <= -2
          ? -1
          : 0
    : 0;
  return [
    {
      id: regional ? "regionalDebt" : "nationalDebt",
      label: regional ? "Regional debt burden" : "National debt burden",
      effect: Math.round(debt * 10) / 10,
    },
    {
      id: regional ? "regionalDeficit" : "nationalDeficit",
      label: regional ? "Regional budget deficit" : "National budget deficit",
      effect: Math.round(deficit * 10) / 10,
    },
    ...(!regional && Number.isFinite(balancePct) && balancePct >= 0.5
      ? [{ id: "nationalBalancedBudget", label: "National balanced budget", effect: 1 }]
      : []),
    ...(!regional &&
    Number.isFinite(balancePct) &&
    Number.isFinite(debtPct) &&
    balancePct >= 1 &&
    debtPct <= 90
      ? [{ id: "nationalFiscalDiscipline", label: "National fiscal discipline", effect: 1 }]
      : []),
  ]
    .filter((row) => row.effect !== 0)
    .map((row) => ({ ...row, source: "fiscal" as const, marginEffect: 0 }));
}
