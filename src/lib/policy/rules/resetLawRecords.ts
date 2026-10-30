/**
 * Reset-era program laws as statute-book rows. Plain data in, plain data out:
 * the loader in `resetLawPolicyRecords.ts` owns the database reads.
 */
import type { PolicyProvenance } from "../policyRecordPayload";
import type { PolicyRecordResponse } from "../types";

export const RESET_LAW_RECORD_PREFIX = "resetLaw:";

/** The statute-book title (policy domain) each reset law family files under. */
const FAMILY_POLICY_DOMAIN: Record<string, string> = {
  L01: "social",
  L02: "social",
  L03: "economic",
  L04: "economic",
  L05: "economic",
  L06: "economic",
  L07: "trade",
  L08: "economic",
  L09: "economic",
  L10: "education",
  L11: "education",
  L12: "education",
  L13: "education",
  L14: "education",
  L15: "technology",
  L16: "healthcare",
  L17: "healthcare",
  L18: "healthcare",
  L19: "healthcare",
  L20: "healthcare",
  L21: "healthcare",
  L22: "infrastructure",
  L23: "social",
  L24: "social",
  L25: "infrastructure",
  L26: "infrastructure",
  L27: "infrastructure",
  L28: "infrastructure",
  L29: "infrastructure",
  L30: "environment",
  L31: "environment",
  L32: "environment",
  L33: "environment",
  L34: "publicSafety",
  L35: "law_justice",
  L36: "law_justice",
  L37: "agriculture",
  L38: "social",
  L39: "immigration",
  L40: "social",
  L41: "social",
  L42: "economic",
  L43: "governance",
  L44: "governance",
  L45: "governance",
  L46: "law_justice",
  L47: "mediaInformation",
  L48: "defense",
  L49: "immigration",
  L50: "publicSafety",
  L51: "healthcare",
  L52: "immigration",
};

export function resetLawPolicyDomain(familyId: string): string {
  return FAMILY_POLICY_DOMAIN[familyId] ?? "governance";
}

export interface ResetLawProgramRow {
  familyId: string;
  /** Law family name, e.g. "Care affordability and prices". */
  familyTitle: string;
  choice: string;
  titleSnapshot: string;
  descriptionSnapshot: string;
  effectiveTurn: number;
  enactedByBillId: string;
  /** Title and signing date of the enacting bill, when the bill row is found. */
  billTitle: string | null;
  enactedAt: Date | null;
  enactedYear: number | null;
}

const CHOICE_LABELS: Record<string, string> = {
  far_left: "Far left",
  center_left: "Center left",
  center: "Center",
  center_right: "Center right",
  far_right: "Far right",
};

export function recordIdForResetLaw(familyId: string): string {
  return `${RESET_LAW_RECORD_PREFIX}${familyId}`;
}

export function buildResetLawRecord(row: ResetLawProgramRow): PolicyRecordResponse {
  const choice = CHOICE_LABELS[row.choice] ?? row.choice.replace(/_/g, " ");
  return {
    recordType: "policy",
    legislationTypeId: recordIdForResetLaw(row.familyId),
    name: row.familyTitle,
    policyDomain: resetLawPolicyDomain(row.familyId),
    economic: 0,
    social: 0,
    nationalOnly: false,
    policyOptionName: row.titleSnapshot,
    // Program laws carry no left-right lean of their own, so they stay out of the axis averages.
    hasEconomic: false,
    hasSocial: false,
    metricEffects: [],
    detailText: `${choice} choice, in force from turn ${row.effectiveTurn}`,
    enactedByKind: "bill",
    enactedByBillId: row.enactedByBillId,
  };
}

/** Provenance keyed like the statute book looks it up, so the row shows when and by which bill. */
export function buildResetLawProvenance(
  rows: readonly ResetLawProgramRow[]
): Record<string, PolicyProvenance> {
  const out: Record<string, PolicyProvenance> = {};
  for (const row of rows) {
    if (!row.enactedAt || row.enactedYear == null) continue;
    out[recordIdForResetLaw(row.familyId)] = {
      title: row.billTitle ?? row.titleSnapshot,
      enactedAt: row.enactedAt.toISOString(),
      enactedYear: row.enactedYear,
      annualCost: null,
    };
  }
  return out;
}
