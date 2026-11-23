import type { OfficeActingRole } from "@/lib/governorOffice/access";

const ROLE_LABELS: Record<Exclude<OfficeActingRole, "holder">, string> = {
  stateChair: "State Party Chair",
  stateViceChair: "State Party Vice-Chair",
  nationalChair: "National Party Chair",
  nationalViceChair: "National Party Vice-Chair",
};

/**
 * Credit line for an order. A party officer can sign orders for an office its
 * party holds through a non-player official, so the name alone would read as a
 * claim that the officer holds that office.
 */
export function orderIssuerLabel(
  characterName: string,
  actingRole: OfficeActingRole | null,
  officeHolderName: string | null,
  officeTitle: string
): string {
  if (!actingRole || actingRole === "holder") return characterName;
  const role = ROLE_LABELS[actingRole];
  return officeHolderName
    ? `${characterName} (${role}, acting for ${officeTitle} ${officeHolderName})`
    : `${characterName} (${role}, acting for the ${officeTitle})`;
}
