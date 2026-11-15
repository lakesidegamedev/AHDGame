/**
 * Cash raised by sovereign issuance in one turn. The issuer's opening-at-par
 * snapshot is taken before the unsold-placement sweep; later placements add
 * their actual consideration, not their debt face. These are disjoint cash
 * events even when the placement concerns a bond issued earlier this turn.
 */
export function sovereignIssuanceFlowsByCountry(input: {
  atParIssues: readonly { countryId: string; face: number }[];
  placements: readonly { countryId: string; face: number; cashPaid: number }[];
}): Record<string, { cash: number; face: number }> {
  const flows = new Map<string, { cash: number; face: number }>();
  const add = (countryId: string, cash: number, face: number): void => {
    if (
      !countryId ||
      !Number.isFinite(cash) ||
      cash < 0 ||
      !Number.isSafeInteger(face) ||
      face < 0
    ) {
      throw new Error("Invalid sovereign cash event");
    }
    const previous = flows.get(countryId) ?? { cash: 0, face: 0 };
    const totalCash = previous.cash + cash;
    const totalFace = previous.face + face;
    if (
      !Number.isFinite(totalCash) ||
      totalCash > Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(totalFace)
    ) {
      throw new Error("Sovereign cash proceeds exceed safe units");
    }
    flows.set(countryId, { cash: totalCash, face: totalFace });
  };
  for (const issue of input.atParIssues) add(issue.countryId, issue.face, issue.face);
  for (const placement of input.placements)
    add(placement.countryId, placement.cashPaid, placement.face);
  return Object.fromEntries(flows);
}

/** Bond stock is authoritative; in-kind exchanges move no cash or net face. */
export function reconcileSovereignDebtFaceFlows(input: {
  openingDebt: number;
  closingDebt: number;
  issuedFace: number;
}): { issuedFace: number; retiredFace: number } {
  for (const value of Object.values(input)) {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new Error("Invalid sovereign principal stock or issuance");
    }
  }
  const issuedFace = Math.max(input.issuedFace, input.closingDebt - input.openingDebt);
  return { issuedFace, retiredFace: input.openingDebt + issuedFace - input.closingDebt };
}
