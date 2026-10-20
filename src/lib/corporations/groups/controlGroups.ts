/**
 * Control groups for size costs: every corporation resolved to its ultimate
 * controlling corporate owner, following >50% control links whether or not the
 * subsidiary is formalized. Owner decision 2026-10-20 (contestability plan):
 * size costs are measured on the whole group so splitting a business into
 * subsidiaries, including NPP-run ones, does not dodge them.
 *
 * Tax groups (`resolveFormalizedGroups`) still require formalization; this is
 * a separate, wider grouping used only for size costs.
 */
import type { Corporation } from "@/lib/db/types";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { resolveMembershipRows } from "./rules/membership";

/** Root (ultimate controller) id for every corporation, itself when uncontrolled. */
export function controlGroupRootByCorpId(
  corps: readonly Pick<
    Corporation,
    "_id" | "shareholders" | "totalShares" | "superShareMultiplier"
  >[]
): Map<string, string> {
  return resolveMembershipRows(
    corps.map((c) => ({
      id: c._id.toString(),
      parentId: getControllingCorporateParent(c as Corporation)?.corporationId.toString(),
      formalized: true,
    }))
  ).rootByCorpId;
}

/** Sum a per-corporation quantity over each corporation's control group. */
export function groupTotals(
  rootByCorpId: ReadonlyMap<string, string>,
  valueByCorpId: ReadonlyMap<string, number>
): Map<string, number> {
  const byRoot = new Map<string, number>();
  for (const [corpId, value] of valueByCorpId) {
    const root = rootByCorpId.get(corpId) ?? corpId;
    byRoot.set(root, (byRoot.get(root) ?? 0) + value);
  }
  const byCorp = new Map<string, number>();
  for (const corpId of valueByCorpId.keys()) {
    byCorp.set(corpId, byRoot.get(rootByCorpId.get(corpId) ?? corpId) ?? 0);
  }
  return byCorp;
}
