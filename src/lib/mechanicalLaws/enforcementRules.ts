/**
 * Enforcement of the Subsidiary Limits and Foreign Investment Acts: which
 * subsidiaries a group must give up, and how many shares it must sell to do
 * so. Pure: plain data in, plain data out.
 *
 * A group is everything one corporation controls with more than half the
 * votes, directly or through other controlled companies, formalized or not.
 * "Foreign" means the group's root is headquartered in another country.
 */
import { resolveMembershipRows } from "@/lib/corporations/groups/rules/membership";
import {
  foreignInvestmentRuleForLevel,
  subsidiaryCapForLevel,
  type MechanicalLawLevel,
} from "./rules";

export interface ControlRow {
  id: string;
  /** Headquarters country. */
  countryId: string;
  /** Controlling corporate holder (>50% voting power), if any. */
  parentId?: string;
  /** Turn the company became a managed subsidiary; newer ones go first. */
  formalizedAtTurn?: number;
}

export interface IndustryRow {
  corpId: string;
  /** Country the sector operates in. */
  countryId: string;
  sectorType: string;
  revenue: number;
}

export type ComplianceReason = "subsidiaryCap" | "foreignBan" | "foreignShareCap";

export interface ComplianceFinding {
  corpId: string;
  rootId: string;
  /** Country whose law is breached. */
  countryId: string;
  reason: ComplianceReason;
}

export interface LawLevels {
  subsidiaryLimits: MechanicalLawLevel;
  foreignInvestment: MechanicalLawLevel;
}

/**
 * Root of every controlled company, and the members of each group. Same
 * resolution as the size-cost control groups (groups/controlGroups.ts):
 * every >50% controlling link counts, formalized or not.
 */
export function controlGroups(rows: readonly ControlRow[]) {
  return resolveMembershipRows(
    rows.map((r) => ({ id: r.id, parentId: r.parentId, formalized: true }))
  );
}

/**
 * Subsidiaries that breach a law today. A company breaching several rules is
 * reported once, for the first rule in this order: foreign ban, subsidiary
 * cap, foreign share cap. Groups with no member over a limit report nothing.
 */
export function findNoncompliantSubsidiaries(input: {
  rows: readonly ControlRow[];
  levelsByCountry: ReadonlyMap<string, LawLevels>;
  industry: readonly IndustryRow[];
}): ComplianceFinding[] {
  const byId = new Map(input.rows.map((r) => [r.id, r]));
  const { rootByCorpId, membersByRootId } = controlGroups(input.rows);
  const flagged = new Map<string, ComplianceFinding>();
  const flag = (f: ComplianceFinding) => {
    if (!flagged.has(f.corpId)) flagged.set(f.corpId, f);
  };

  for (const [rootId, memberIds] of membersByRootId) {
    const root = byId.get(rootId);
    if (!root) continue;
    const subsidiaries = [...memberIds]
      .filter((id) => id !== rootId)
      .map((id) => byId.get(id))
      .filter((r): r is ControlRow => r != null);

    // Foreign ban: every foreign-controlled subsidiary in a banning country.
    for (const sub of subsidiaries) {
      if (sub.countryId === root.countryId) continue;
      const level = input.levelsByCountry.get(sub.countryId)?.foreignInvestment ?? 0;
      if (foreignInvestmentRuleForLevel(level).kind === "ban") {
        flag({ corpId: sub.id, rootId, countryId: sub.countryId, reason: "foreignBan" });
      }
    }

    // Subsidiary cap, per country: the newest subsidiaries over the cap.
    const byCountry = new Map<string, ControlRow[]>();
    for (const sub of subsidiaries) {
      const list = byCountry.get(sub.countryId) ?? [];
      list.push(sub);
      byCountry.set(sub.countryId, list);
    }
    for (const [countryId, list] of byCountry) {
      const cap = subsidiaryCapForLevel(
        input.levelsByCountry.get(countryId)?.subsidiaryLimits ?? 0
      );
      if (cap == null || list.length <= cap) continue;
      const newestFirst = [...list].sort(
        (a, b) => (b.formalizedAtTurn ?? 0) - (a.formalizedAtTurn ?? 0) || (a.id < b.id ? 1 : -1)
      );
      for (const sub of newestFirst.slice(0, list.length - cap)) {
        flag({ corpId: sub.id, rootId, countryId, reason: "subsidiaryCap" });
      }
    }
  }

  // Foreign share cap, per country and industry: shed the largest foreign
  // subsidiaries until foreign-controlled groups are back under the cap.
  const total = new Map<string, number>();
  const foreignBySub = new Map<string, Map<string, number>>();
  for (const row of input.industry) {
    if (!(row.revenue > 0)) continue;
    const cell = `${row.countryId}|${row.sectorType}`;
    total.set(cell, (total.get(cell) ?? 0) + row.revenue);
    const rootId = rootByCorpId.get(row.corpId) ?? row.corpId;
    const root = byId.get(rootId);
    if (!root || root.countryId === row.countryId) continue;
    const perSub = foreignBySub.get(cell) ?? new Map<string, number>();
    perSub.set(row.corpId, (perSub.get(row.corpId) ?? 0) + row.revenue);
    foreignBySub.set(cell, perSub);
  }
  for (const [cell, perCorp] of foreignBySub) {
    const [countryId] = cell.split("|");
    const rule = foreignInvestmentRuleForLevel(
      input.levelsByCountry.get(countryId)?.foreignInvestment ?? 0
    );
    if (rule.kind !== "cap") continue;
    const cellTotal = total.get(cell) ?? 0;
    if (!(cellTotal > 0)) continue;
    let foreign = [...perCorp.values()].reduce((a, b) => a + b, 0);
    const limit = (rule.maxIndustrySharePct / 100) * cellTotal;
    // Only subsidiaries can be sold off; a foreign root's own sectors stay.
    const sellable = [...perCorp]
      .filter(([corpId]) => (rootByCorpId.get(corpId) ?? corpId) !== corpId)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [corpId, revenue] of sellable) {
      if (foreign <= limit) break;
      const rootId = rootByCorpId.get(corpId)!;
      flag({ corpId, rootId, countryId, reason: "foreignShareCap" });
      foreign -= revenue;
    }
  }

  return [...flagged.values()].sort((a, b) => (a.corpId < b.corpId ? -1 : 1));
}

/**
 * Shares the controlling holder must sell to hold at most half the company.
 * Zero when it already holds half or less.
 */
export function sharesToDropControl(totalShares: number, heldShares: number): number {
  if (!(totalShares > 0) || !(heldShares > 0)) return 0;
  const keep = Math.floor(totalShares / 2);
  return Math.max(0, Math.ceil(heldShares - keep));
}

/** Plain explanation of a finding, for owner notices. */
export function complianceReasonText(reason: ComplianceReason): string {
  switch (reason) {
    case "foreignBan":
      return "this country's Foreign Investment Act bans foreign-controlled subsidiaries";
    case "foreignShareCap":
      return "foreign-controlled groups hold more of this industry than the Foreign Investment Act allows";
    default:
      return "your group runs more subsidiaries here than the Subsidiary Limits Act allows";
  }
}

export interface DominantGroup {
  rootId: string;
  countryId: string;
  sectorType: string;
  sharePercent: number;
  thresholdPercent: number;
}

/**
 * Groups at or above the breakup threshold of their country's Competition Act
 * (levels 3 and 4) in some national industry. One entry per group and
 * country: its strongest industry there. `thresholdForCompetitionLevel`
 * returns the review threshold for a level, or null for no review.
 */
export function findDominantGroups(input: {
  rows: readonly ControlRow[];
  industry: readonly IndustryRow[];
  competitionLevelByCountry: ReadonlyMap<string, MechanicalLawLevel>;
  thresholdForCompetitionLevel: (level: MechanicalLawLevel) => number | null;
}): DominantGroup[] {
  const { rootByCorpId } = controlGroups(input.rows);
  const total = new Map<string, number>();
  const byRoot = new Map<string, number>();
  for (const row of input.industry) {
    if (!(row.revenue > 0)) continue;
    const cell = `${row.countryId}|${row.sectorType}`;
    total.set(cell, (total.get(cell) ?? 0) + row.revenue);
    const rootId = rootByCorpId.get(row.corpId) ?? row.corpId;
    const key = `${rootId}|${cell}`;
    byRoot.set(key, (byRoot.get(key) ?? 0) + row.revenue);
  }
  const strongest = new Map<string, DominantGroup>();
  for (const [key, revenue] of byRoot) {
    const [rootId, countryId, sectorType] = key.split("|");
    const level = input.competitionLevelByCountry.get(countryId) ?? 0;
    if (level < 3) continue;
    const threshold = input.thresholdForCompetitionLevel(level);
    const cellTotal = total.get(`${countryId}|${sectorType}`) ?? 0;
    if (threshold == null || !(cellTotal > 0)) continue;
    const sharePercent = (revenue / cellTotal) * 100;
    if (sharePercent < threshold) continue;
    const slot = `${rootId}|${countryId}`;
    const prior = strongest.get(slot);
    if (!prior || sharePercent > prior.sharePercent) {
      strongest.set(slot, {
        rootId,
        countryId,
        sectorType,
        sharePercent,
        thresholdPercent: threshold,
      });
    }
  }
  return [...strongest.values()].sort((a, b) =>
    a.rootId === b.rootId ? (a.countryId < b.countryId ? -1 : 1) : a.rootId < b.rootId ? -1 : 1
  );
}

/** Turns a breakup case stays open for the competition authority to decide. */
export const BREAKUP_CASE_TURNS = 6;
