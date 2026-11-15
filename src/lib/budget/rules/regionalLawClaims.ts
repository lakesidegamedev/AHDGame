import type { EnactedLaw } from "@/lib/db/types/budget";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { RegionalLawClaim } from "./regionalSpending";

/** Adapt loaded law metadata to the portable funding input; no reads per law. */
export function regionalLawClaims(
  rows: readonly { law: EnactedLaw; annualCost: number; category: string }[],
  types: ReadonlyMap<string, LegislationType>,
  previous: ReadonlySet<string>
): RegionalLawClaim[] {
  return rows.map(({ law, annualCost, category }) => {
    const option =
      typeof law.policyOptionIndex === "number"
        ? types.get(law.legislationTypeId)?.policyOptions?.[law.policyOptionIndex]
        : undefined;
    const implementation = option?.implementation;
    const id =
      implementation?.programId ??
      `${law.legislationTypeId}:${option?.id ?? law.policyOptionIndex ?? "current"}`;
    return {
      category,
      annualCost,
      claim: {
        programId: id,
        legislationTypeId: law.legislationTypeId,
        policyOptionId: option?.id ?? String(law.policyOptionIndex ?? "current"),
        authorizedCost: Math.max(0, annualCost),
        obligationPriority: implementation?.obligationPriority ?? 5,
        fundingSemantics: implementation?.fundingSemantics ?? "appropriation_included",
        continuing: previous.has(id),
      },
    };
  });
}
