import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";

/** Whole-currency successor claims and an exact source residual, like department authority. */
export function splitNationalLawReferences(
  references: readonly OpeningLawReference[],
  weight: number,
  moved: boolean
): OpeningLawReference[] {
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 1)
    throw new Error("Invalid law funding split");
  return references.map((reference) => ({
    ...reference,
    sourceComponents: reference.sourceComponents.map((source) => {
      const share = Math.floor(source.annualBooked * weight);
      return { ...source, annualBooked: moved ? share : source.annualBooked - share };
    }),
  }));
}

/** Match the integer per-account split of live departmental authority. */
export function splitInheritedLawAuthority(
  accounts: readonly { familyAnnualDemand: Record<string, number> }[],
  weight: number,
  moved: boolean
) {
  const totals: Record<string, number> = {};
  for (const account of accounts)
    for (const [family, annual] of Object.entries(account.familyAnnualDemand)) {
      const share = Math.floor(annual * weight);
      totals[family] = (totals[family] ?? 0) + (moved ? share : annual - share);
    }
  return totals;
}

/** Fill legal coverage from the reviewed opening law, never a new appropriation. */
export function completeSuccessorLawReferences(input: {
  current: readonly OpeningLawReference[];
  fallback: readonly OpeningLawReference[];
  countryId: ResetCountry;
  scope: "national" | "regional";
  inheritedAuthority?: Readonly<Record<string, number>>;
}): OpeningLawReference[] {
  const references = new Map(input.current.map((row) => [row.familyId, row]));
  for (const reference of input.fallback) {
    if (references.has(reference.familyId)) continue;
    const authority = input.inheritedAuthority?.[reference.familyId] ?? 0;
    if (!Number.isSafeInteger(authority) || authority < 0)
      throw new Error("Invalid inherited law authority");
    references.set(reference.familyId, {
      ...reference,
      key: `${input.countryId}:${input.scope}:${reference.familyId}`,
      country: input.countryId,
      scope: input.scope,
      status: "inherited-default",
      legalNote: `${reference.legalNote} Reviewed inherited default at independence; no additional spending authority is created.`,
      sourceComponents: [
        ...reference.sourceComponents.map((source) => ({
          ...source,
          annualBooked: 0,
        })),
        ...(authority > 0
          ? [
              {
                sourceId: `independence:${input.countryId}:${reference.familyId}:existing-authority`,
                selectedOption: "Existing inherited department authority",
                optionIndex: -1,
                historicalDisposition: "retained-legal-lineage",
                fiscalOwner: reference.familyId,
                fiscalRole: "single-booked-owner",
                annualBooked: authority,
                treatment: "Existing funding only; replaceable with the inherited default statute",
              },
            ]
          : []),
      ],
    });
  }
  return [...references.values()];
}

/** Retire current regional requests; no cash is deleted or re-credited. */
export function releasePromotedRegionalClaims(
  budget: RegionalBudget,
  worldId: string,
  countryId: string,
  families: readonly string[]
) {
  const settlements = Object.entries(budget.programSettlements ?? {});
  const retired = settlements.filter(([id]) =>
    families.some((family) => id === `${worldId}:${countryId}:${budget._id}:${family}`)
  );
  const authorized = retired.reduce((sum, [, row]) => sum + row.authorizedCost, 0);
  const funded = retired.reduce((sum, [, row]) => sum + row.fundedAmount, 0);
  const unfunded = retired.reduce((sum, [, row]) => sum + row.unfundedAmount, 0);
  const released = Math.min(Math.max(0, budget.fundedBillCosts ?? budget.enactedBillCosts), funded);
  return {
    programSettlements: Object.fromEntries(
      settlements.filter(([id]) => !retired.some(([removed]) => id === removed))
    ),
    enactedBillCosts: Math.max(0, budget.enactedBillCosts - authorized),
    fundedBillCosts: Math.max(0, (budget.fundedBillCosts ?? 0) - funded),
    unfundedBillCosts: Math.max(0, (budget.unfundedBillCosts ?? 0) - unfunded),
    surplus: budget.surplus + released,
  };
}

/** A promoted program replaces only replaceable national sources, preserving protected transfers. */
export function promotedProgramFunding(reference: OpeningLawReference, annualAuthority: number) {
  const supersededSourceIds = reference.sourceComponents
    .filter(
      (source) =>
        source.historicalDisposition === "retained-legal-lineage" &&
        source.fiscalRole === "single-booked-owner" &&
        source.fiscalOwner === reference.familyId &&
        source.replacementRestriction !== "protected-transfer"
    )
    .map((source) => source.sourceId);
  const retained = reference.sourceComponents.reduce(
    (sum, source) =>
      sum +
      (source.historicalDisposition === "retained-legal-lineage" &&
      source.fiscalRole === "single-booked-owner" &&
      source.fiscalOwner === reference.familyId &&
      !supersededSourceIds.includes(source.sourceId)
        ? source.annualBooked
        : 0),
    0
  );
  // All authority stays on the existing funder. A missing funding envelope yields
  // an unfunded program, not a fresh endowment or a claim on local taxes.
  return {
    supersededSourceIds,
    annualAgencyAllocation: Math.max(0, Math.floor(annualAuthority - retained)),
  };
}
