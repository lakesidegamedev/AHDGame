/**
 * The method a new site founds on when its lane's default method is retired
 * (techTree/sunset). A sector records no strategy and runs the lane's
 * "standard" recipe by default; once that recipe is sunset it is closed to
 * new sites, so the founding takes the first named successor this
 * corporation may run instead.
 *
 * Pure: identities and the world year in, a strategy id or null out.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import type { Corporation } from "@/lib/db/types";
import { getStrategyAvailability } from "@/lib/constants/techTree/strategyAvailability";
import { sunsetSuccessorFor } from "@/lib/constants/techTree/sunset";

export function foundingSunsetSuccessor(args: {
  lane: OperatingSectorType;
  corporation: Pick<
    Corporation,
    "type" | "industryModel" | "mediaDiscriminator" | "unlockedTechNodeIds" | "techDecadeLane"
  >;
  currentYear: number;
  techTreesEnabled: boolean;
}): string | null {
  if (!args.techTreesEnabled) return null;
  const strategies = SECTOR_STRATEGIES[args.lane] ?? [];
  const standard = strategies.find((s) => s.id === "standard");
  const successor = sunsetSuccessorFor(
    standard,
    strategies,
    args.currentYear,
    (candidate) =>
      !getStrategyAvailability(args.corporation, candidate, args.currentYear, true).locked
  );
  return successor?.id ?? null;
}
