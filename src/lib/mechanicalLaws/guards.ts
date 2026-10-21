/**
 * Command-time guards for the Subsidiary Limits and Foreign Investment Acts:
 * refuse an action that would create a new breach. A breach that arises some
 * other way (a law tightening, a resting order filling) is caught by the turn's
 * compliance pass and gets a 48-turn deadline instead.
 *
 * Both return null when allowed, or `{ status: 400, error }`, the same shape as
 * the CEO self-acquisition cap, so call sites keep their two-line pattern.
 */
import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { getMechanicalLawLevels } from "./levels";
import { controlGroups } from "./enforcementRules";
import { foreignInvestmentRuleForLevel, subsidiaryCapForLevel } from "./rules";

export interface LawRejection {
  status: 400;
  error: string;
}

type ControlFields = Pick<
  Corporation,
  | "_id"
  | "countryId"
  | "shareholders"
  | "totalShares"
  | "superShareMultiplier"
  | "subsidiaryFormalizedAtTurn"
>;

const CONTROL_PROJECTION = {
  _id: 1,
  countryId: 1,
  shareholders: 1,
  totalShares: 1,
  superShareMultiplier: 1,
  subsidiaryFormalizedAtTurn: 1,
} as const;

/**
 * The corporation at the top of `corp`'s control chain (itself when nothing
 * controls it). One read of the control table, then an in-memory walk bounded
 * by the number of companies, so a cycle cannot loop.
 */
export async function controllingRoot(db: Db, corp: ControlFields): Promise<ControlFields> {
  if (!getControllingCorporateParent(corp as Corporation)) return corp;
  const all = (await db
    .collection<Corporation>("corporations")
    .find({}, { projection: CONTROL_PROJECTION })
    .toArray()) as ControlFields[];
  const byId = new Map(all.map((c) => [c._id.toString(), c]));
  let current = corp;
  const seen = new Set<string>([corp._id.toString()]);
  for (let hop = 0; hop < all.length; hop++) {
    const parent = getControllingCorporateParent(current as Corporation);
    const next = parent ? byId.get(parent.corporationId.toString()) : undefined;
    if (!next || seen.has(next._id.toString())) return current;
    seen.add(next._id.toString());
    current = next;
  }
  return current;
}

/**
 * Refuse adding one more subsidiary in `countryId` to the group headed by
 * `parent` when that would exceed the country's Subsidiary Limits Act.
 * Counts every company the group controls with more than half the votes and
 * headquarters in that country. Reads the corporations once.
 */
export async function assertSubsidiaryWithinCap(
  db: Db,
  parent: ControlFields,
  countryId: string,
  excludeCorpId?: ObjectId
): Promise<LawRejection | null> {
  const levels = await getMechanicalLawLevels(db, countryId as CountryId);
  const cap = subsidiaryCapForLevel(levels.subsidiaryLimits);
  if (cap == null) return null;
  const root = await controllingRoot(db, parent);
  const corps = (await db
    .collection<Corporation>("corporations")
    .find({}, { projection: CONTROL_PROJECTION })
    .toArray()) as ControlFields[];
  const rows = corps.map((c) => {
    const p = getControllingCorporateParent(c as Corporation);
    return {
      id: c._id.toString(),
      countryId: c.countryId,
      ...(p ? { parentId: p.corporationId.toString() } : {}),
    };
  });
  const { rootByCorpId } = controlGroups(rows);
  const rootId = root._id.toString();
  const existing = rows.filter(
    (r) =>
      r.id !== rootId &&
      r.id !== excludeCorpId?.toString() &&
      r.countryId === countryId &&
      rootByCorpId.get(r.id) === rootId
  ).length;
  if (existing + 1 <= cap) return null;
  return {
    status: 400,
    error: `This country's Subsidiary Limits Act allows a group at most ${cap} subsidiaries here, and your group already runs ${existing}.`,
  };
}

/**
 * Refuse a corporate buyer gaining control of a company in a country whose
 * Foreign Investment Act bans foreign-controlled subsidiaries, when the
 * buyer's group is headquartered elsewhere.
 */
export async function assertForeignControlAllowed(
  db: Db,
  buyer: ControlFields,
  target: Pick<Corporation, "countryId">,
  options: { viaMarket?: boolean } = {}
): Promise<LawRejection | null> {
  const root = await controllingRoot(db, buyer);
  if (root.countryId === target.countryId) return null;
  const levels = await getMechanicalLawLevels(db, target.countryId as CountryId);
  const rule = foreignInvestmentRuleForLevel(levels.foreignInvestment).kind;
  // Screening (and the share caps, which include it) reviews foreign takeovers
  // through merger review, which only acquisitions and takeovers go through.
  if (options.viaMarket && (rule === "screening" || rule === "cap")) {
    return {
      status: 400,
      error:
        "This country's Foreign Investment Act screens foreign takeovers. A group headquartered abroad must make an acquisition offer, which the competition authority reviews, instead of buying control on the market.",
    };
  }
  if (rule !== "ban") return null;
  return {
    status: 400,
    error:
      "This country's Foreign Investment Act bans foreign-controlled subsidiaries, so a group headquartered abroad cannot take control of a company here.",
  };
}

/**
 * Whether buying `addedShares` more would give `buyerId` more than half of
 * `target`'s shares (plain share count; supershares are rare and the turn's
 * compliance pass covers them).
 */
export function wouldGainControl(
  target: Pick<Corporation, "shareholders" | "totalShares">,
  buyerId: ObjectId,
  addedShares: number
): boolean {
  const total = target.totalShares ?? 0;
  if (!(total > 0)) return false;
  const held = target.shareholders?.find((s) => s.corporationId?.equals(buyerId))?.shares ?? 0;
  return held * 2 <= total && (held + addedShares) * 2 > total;
}
