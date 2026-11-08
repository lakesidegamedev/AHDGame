/**
 * When a crisis change is worth an inbox message, and who hears about it.
 * Plain data in, plain data out.
 */
import type { Crisis, CrisisInteraction } from "@/lib/db/types/crisis";

export type AlertCrisis = Pick<
  Crisis,
  "scope" | "countryIds" | "regionIds" | "globalResponse" | "status"
>;

export interface AlertRecipient {
  userId: string;
  countryId?: string;
  homeState?: string;
  /** Holds any office. Country-wide and global alerts go only to officeholders. */
  holdsOffice?: boolean;
}

export type AlertKind = "decision" | "stage";

/** Where the decision tree stands. A new value means the crisis moved. */
export function crisisAlertSignature(
  interaction: Pick<CrisisInteraction, "currentNodeId" | "resolvedAt" | "resolutionPath">
): string {
  return `${interaction.currentNodeId ?? "none"}|${interaction.resolvedAt ? "done" : "open"}|${interaction.resolutionPath.length}`;
}

/**
 * A move to an open decision is "decision"; any other move is "stage". No
 * previous signature means first sight, which the spawn notice already covers.
 */
export function alertKindForChange(
  previous: string | undefined,
  next: string,
  decisionOpen: boolean
): AlertKind | null {
  if (previous === undefined || previous === next) return null;
  return decisionOpen ? "decision" : "stage";
}

/** Countries and states whose residents a crisis reaches. */
export function alertReach(crisis: AlertCrisis): { countryIds: string[]; regionIds: string[] } {
  if (crisis.scope === "region") return { countryIds: [], regionIds: crisis.regionIds };
  if (crisis.scope === "country") return { countryIds: crisis.countryIds, regionIds: [] };
  const listed = crisis.countryIds.length
    ? crisis.countryIds
    : Object.keys(crisis.globalResponse?.roleByCountry ?? {});
  return { countryIds: listed, regionIds: [] };
}

/** One user id per player, however many of their characters the crisis reaches. */
export function alertAudience(crisis: AlertCrisis, candidates: AlertRecipient[]): string[] {
  const { countryIds, regionIds } = alertReach(crisis);
  const users = new Set<string>();
  for (const c of candidates) {
    const hit =
      (!!c.countryId && countryIds.includes(c.countryId) && !!c.holdsOffice) ||
      (!!c.homeState && regionIds.includes(c.homeState));
    if (hit) users.add(c.userId);
  }
  return [...users];
}
