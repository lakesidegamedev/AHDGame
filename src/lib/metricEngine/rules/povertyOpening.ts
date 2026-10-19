/**
 * Existing poverty statutes keep their funded relief until replaced.
 * openingPovertyPrograms uses the same opening choices and authored responses
 * as the law catalog; a replacement suppresses its entire opening family.
 */
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import profiles from "@/lib/resetLegislation/provisionalBalanceProfiles.json";
import { openingChoice1991 } from "@/lib/resetLegislation/rules/reviewCatalog";
import type { ResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import type { PovertyProgram } from "./poverty";

export const POVERTY_FAMILY_IDS = resetLawFamilies
  .filter((family) => family.primaryMetricIds.includes("03"))
  .map((family) => family.id);
const positions = ["far_left", "center_left", "center", "center_right", "far_right"];
const key = (row: { country: string; scope: string; regionId?: string; familyId: string }) =>
  `${row.country}:${row.scope}:${row.regionId ?? ""}:${row.familyId}`;

export function openingPovertyPrograms(input: {
  worldId: string;
  boards: readonly Pick<
    ResetLawOpeningBoard,
    "countryId" | "scope" | "regionId" | "sourceTurn" | "references"
  >[];
  replacements: readonly PovertyProgram[];
  accounts: readonly {
    _id: string;
    countryId: string;
    familyAnnualDemand?: Record<string, number>;
  }[];
}): PovertyProgram[] {
  const replaced = new Set(input.replacements.map(key));
  const out: PovertyProgram[] = [];
  for (const board of input.boards) {
    for (const familyId of POVERTY_FAMILY_IDS) {
      const reference = board.references[familyId];
      const identity = {
        country: board.countryId,
        scope: board.scope,
        regionId: board.regionId,
        familyId,
      };
      if (
        !reference ||
        reference.status === "no-dedicated-law" ||
        reference.sourceComponents.length === 0 ||
        replaced.has(key(identity))
      )
        continue;
      const response = profiles.find((profile) => profile.familyId === familyId)?.primaryResponse[
        positions.indexOf(openingChoice1991(reference))
      ];
      if (response === undefined || !Number.isFinite(response)) continue;
      const id = `${input.worldId}:${board.countryId}:${board.regionId ?? "national"}:${familyId}`;
      if (board.scope === "national") {
        const account = input.accounts.find(
          (candidate) =>
            candidate.countryId === board.countryId &&
            candidate.familyAnnualDemand?.[familyId] !== undefined
        );
        if (account)
          out.push({
            ...identity,
            _id: id,
            fundingAccountId: account._id,
            effectiveTurn: board.sourceTurn,
            primaryMetricEffects: [{ metricId: "03", favorableNormalizedPoints: response }],
          });
      } else {
        const total = reference.sourceComponents.reduce(
          (sum, source) => sum + Math.max(0, source.annualBooked),
          0
        );
        for (const source of reference.sourceComponents) {
          const weight =
            total > 0
              ? Math.max(0, source.annualBooked) / total
              : 1 / reference.sourceComponents.length;
          out.push({
            ...identity,
            _id: `${id}:${source.sourceId}`,
            fundingAccountId: "regional_budget",
            effectiveTurn: board.sourceTurn,
            settlementLawId: source.sourceId,
            primaryMetricEffects: [
              { metricId: "03", favorableNormalizedPoints: response * weight },
            ],
          });
        }
      }
    }
  }
  return out;
}
