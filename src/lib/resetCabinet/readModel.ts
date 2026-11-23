/** Display only the v2 institution's own account and 1991 source claims. */
import type { DepartmentDefinition } from "@/lib/governmentFinance/departmentCatalog";
import type { DepartmentFinanceReadModel } from "@/lib/governmentFinance/readModel";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import { resetLawFamilyById } from "@/lib/resetLegislation/catalog";
import { getCatalog } from "@/lib/politicalLegislation/catalog";
import {
  activeDepartmentProgramFamilyIds,
  activeDepartmentProgramFundingControl,
  type CurrentNationalLawProgram,
} from "./rules/programRoster";

/**
 * Defence and intelligence money lives in its own ledger (the defence budget and
 * the intelligence appropriation), never in this department account. Their
 * account record stays at zero, so the panel names where the money really is and
 * shows figures only when the record carries one (the defence opening claim),
 * never a row of zeros that reads as "unfunded".
 */
const SPECIALIZED_ACCOUNT_EXPLANATION: Record<string, string> = {
  intelligence:
    "Intelligence money is not held in this account. It is set by the country's intelligence funding law, and the yearly appropriation and its balance are shown on the Intelligence tab. A country that has not enacted that law has no intelligence funding.",
  defense:
    "Defence money is not held in this account. It is set by defence law and paid through the defence budget. Any yearly figure below is the opening defence claim, shown for reference and not paid twice.",
};
/** Names the law that funds intelligence and where a player files it. */
function intelligenceLawPointer(countryId: string): string {
  let law;
  try {
    law = getCatalog(countryId).find((l) => l.budgetKeyOverride === "intelligence");
  } catch {
    return "";
  }
  if (!law) return "";
  const category = law.category
    ? law.category.charAt(0).toUpperCase() + law.category.slice(1)
    : undefined;
  return category
    ? ` To fund it, propose the ${law.title} as a national bill. It is listed under the ${category} category.`
    : ` To fund it, propose the ${law.title} as a national bill.`;
}

const SPECIALIZED_ACCOUNT_FALLBACK =
  "This institution is funded through its own ledger, not this account.";

const ZERO_BUDGET_OFFICE_EXPLANATION =
  "This office has no associated laws, so its legislative budget is intentionally zero. Staff actions do not require legislative funding.";

export function buildResetDepartmentFinanceReadModel(input: {
  definition: DepartmentDefinition;
  departmentName: string;
  account?: ResetDepartmentAccountSnapshot;
  currentPrograms?: readonly CurrentNationalLawProgram[];
}): DepartmentFinanceReadModel {
  const { definition, departmentName, account, currentPrograms = [] } = input;
  if (!account) {
    return {
      enabled: true,
      allocationMode: "demand",
      departmentId: definition.id,
      departmentName,
      kind: definition.kind,
      accountPolicyId: definition.accountPolicyId,
      explanation: "This world has no verified v2 account for the department.",
      programs: [],
    };
  }
  const programs = account.externallySettled
    ? []
    : activeDepartmentProgramFamilyIds(account, currentPrograms).map((familyId) => {
        const annualDemand = account.familyAnnualDemand[familyId] ?? 0;
        const family = resetLawFamilyById(familyId);
        const delivery = account.lastProgramDelivery?.[familyId];
        const fundingControl = activeDepartmentProgramFundingControl(
          account,
          familyId,
          currentPrograms
        );
        return {
          enabled: true,
          departmentName,
          programId: familyId,
          programName: family?.title ?? familyId,
          explanation:
            fundingControl === "required"
              ? "Current law requires this program's full enacted funding request. Treasury payment and operating capacity still limit delivery."
              : fundingControl === "no_separate_allocation"
                ? "Current law has no separate discretionary Cabinet allocation."
                : "The Cabinet request can shift delivery priority, but does not change enacted law or add treasury authority.",
          status: "operating" as const,
          annualDemand,
          allocationPercent:
            fundingControl === "adjustable"
              ? (account.programAllocationPercents[familyId] ?? 100)
              : 100,
          fundingControl,
          ...(delivery
            ? { outlaid: delivery.outlaid, lastSettledTurn: account.accruedThroughTurn }
            : {}),
        };
      });
  if (account.externallySettled) {
    const hasFigures =
      account.annualAuthority !== 0 ||
      account.balance !== 0 ||
      account.encumbered !== 0 ||
      account.arrears !== 0;
    return {
      enabled: true,
      allocationMode: "demand",
      departmentId: definition.id,
      departmentName,
      kind: definition.kind,
      accountPolicyId: definition.accountPolicyId,
      explanation:
        (SPECIALIZED_ACCOUNT_EXPLANATION[definition.accountPolicyId ?? ""] ??
          SPECIALIZED_ACCOUNT_FALLBACK) +
        (definition.accountPolicyId === "intelligence"
          ? intelligenceLawPointer(definition.countryId)
          : ""),
      ...(hasFigures
        ? {
            annualAuthority: account.annualAuthority,
            balance: account.balance,
            availableBalance: Math.max(0, account.balance - account.encumbered),
            encumbered: account.encumbered,
            arrears: account.arrears,
          }
        : {}),
      lastAllocationChangedTurn: account.lastAllocationChangedTurn,
      programs,
    };
  }
  return {
    enabled: true,
    allocationMode: "demand",
    departmentId: definition.id,
    departmentName,
    kind: definition.kind,
    accountPolicyId: definition.accountPolicyId,
    explanation:
      programs.length === 0 &&
      account.annualAuthority === 0 &&
      account.balance === 0 &&
      account.encumbered === 0 &&
      account.arrears === 0
        ? ZERO_BUDGET_OFFICE_EXPLANATION
        : "This is the department's share of existing national spending, net of regional grants. A Cabinet member may request more or less for each service; actual delivery cannot exceed paid funds and capacity.",
    annualAuthority: account.annualAuthority,
    balance: account.balance,
    availableBalance: Math.max(0, account.balance - account.encumbered),
    encumbered: account.encumbered,
    arrears: account.arrears,
    unpaidAuthority: account.unpaidAuthority ?? 0,
    lastAuthorityPaid: account.lastAuthorityPaid,
    lastAllocationChangedTurn: account.lastAllocationChangedTurn,
    programs,
  };
}
