/**
 * Housing funding belongs to the region in which a law operates. housingFunding
 * uses national paid receipts and, only for the labeled model, regional funded
 * accrual. Appropriations and implementation percentages are never cash receipts.
 */
import { householdBenefitFunding } from "./householdBenefitFunding";
import {
  metricLawRoleMatches,
  type MetricLawProgram,
  type MetricLawRoleBinding,
  type MetricLawSettlement,
} from "./lawDelivery";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

export type HousingRole = MetricLawRoleBinding & {
  role: "construction" | "landlord-assistance" | "rehousing" | "other";
  share?: number;
};
export function housingFunding(input: {
  countryId: string;
  turn: number;
  modeled: boolean;
  regions: readonly { regionId: string; population: number }[];
  programs: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
  roles: readonly HousingRole[];
  householdCashShares: ReadonlyMap<string, number>;
}): Map<string, { construction: number; annualAssistance: number; rehousing: number }> | undefined {
  const programs = input.programs.filter((p) => p.country === input.countryId);
  const roles = new Map(input.roles.map((r) => [r.programId, r]));
  const rows = new Map(
    input.regions.map((r) => [r.regionId, { construction: 0, annualAssistance: 0, rehousing: 0 }])
  );
  if (
    !rows.size ||
    rows.size !== input.regions.length ||
    roles.size !== input.roles.length ||
    roles.size !== programs.length ||
    new Set(programs.map((p) => p._id)).size !== programs.length ||
    input.regions.some((r) => !Number.isSafeInteger(r.population) || r.population <= 0)
  )
    return undefined;
  const seen = new Map<string, string>();
  for (const program of programs) {
    const share = input.householdCashShares.get(program._id) ?? 0;
    if (!Number.isFinite(share) || share < 0 || share > 1) return undefined;
    if (share === 0) continue;
    const receipt = householdBenefitFunding(program, input.settlements, input.turn, input.modeled);
    if (!receipt || seen.has(receipt.key)) return undefined;
    seen.set(receipt.key, program._id);
  }
  for (const p of programs) {
    const role = roles.get(p._id);
    if (!metricLawRoleMatches(p, role)) return undefined;
    if (!["construction", "landlord-assistance", "rehousing", "other"].includes(role!.role))
      return undefined;
    if (role!.role === "other") continue;
    if (
      !Number.isFinite(role!.share) ||
      role!.share! < 0 ||
      role!.share! > 1 ||
      role!.share! + (input.householdCashShares.get(p._id) ?? 0) > 1
    )
      return undefined;
    const receipt = householdBenefitFunding(p, input.settlements, input.turn, input.modeled);
    if (!receipt || (seen.has(receipt.key) && seen.get(receipt.key) !== p._id)) return undefined;
    seen.set(receipt.key, p._id);
    const eligible =
      p.scope === "national"
        ? input.regions
        : input.regions.filter((r) => r.regionId === p.regionId);
    if (!eligible.length) return undefined;
    const total = eligible.reduce((n, r) => n + r.population, 0);
    for (const region of eligible) {
      const amount = (receipt.annualAmount * role!.share! * region.population) / total;
      const row = rows.get(region.regionId)!;
      if (role!.role === "construction") row.construction += amount / TURNS_PER_YEAR;
      else if (role!.role === "rehousing") row.rehousing += amount / TURNS_PER_YEAR;
      else row.annualAssistance += amount;
    }
  }
  if (
    [...rows.values()].some(
      (r) =>
        ![r.construction, r.annualAssistance, r.rehousing].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER
        )
    )
  )
    return undefined;
  return rows;
}
