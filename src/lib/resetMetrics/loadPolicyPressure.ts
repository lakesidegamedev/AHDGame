/** Metric pressure is delivered statute change relative to opening law, plus active Cabinet actions. */
import type { Db } from "mongodb";
import type { ResetCabinetActionState } from "@/lib/resetCabinet/rules/actionState";
import {
  combineActiveActionEffects,
  mergeApplicableActionEffects,
} from "@/lib/resetCabinet/rules/actions";
import { loadMetricLawDelivery } from "./loadLawDelivery";
import { metricPolicyPressure } from "./rules/policyPressure";
import type { ResetMetricSnapshot } from "./rules/snapshot";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { resetCabinetActionStatesCollection } from "@/lib/db/repositories/resetCabinetActionStates";

export function cabinetActionApplies(
  scope: string,
  boardScope: "national" | "regional",
  regionId?: string
): boolean {
  if (scope === "Nat") return true;
  if (scope === "Vet") return boardScope === "regional";
  return (
    boardScope === "regional" &&
    ((scope === "NI" && regionId === "NIR") ||
      (scope === "SCT" && countryHasFeature("scoSeeds", regionId)) ||
      (countryHasFeature("walSeeds", scope) && countryHasFeature("walSeeds", regionId)))
  );
}

export async function loadResetPolicyPressure(
  db: Db,
  input: {
    worldId: string;
    boards: readonly ResetMetricSnapshot[];
    turn: number;
    laws?: Awaited<ReturnType<typeof loadMetricLawDelivery>>;
  }
): Promise<Map<string, Record<string, number>>> {
  const { worldId, boards, turn } = input;
  if (!boards.length) return new Map();
  const countryIds = [...new Set(boards.map((b) => b.countryId))];
  const [laws, actions] = await Promise.all([
    input.laws ??
      loadMetricLawDelivery(db, {
        worldId,
        turn,
        countryIds,
        regions: boards
          .filter((b) => b.scope === "regional")
          .map((b) => ({ _id: b.regionId!, countryId: b.countryId })),
      }),
    resetCabinetActionStatesCollection<ResetCabinetActionState>(db)
      .find({ _id: { $in: countryIds }, worldId }, { projection: { _id: 1, active: 1 } })
      .toArray(),
  ]);
  const activeByCountry = new Map(actions.map((a) => [String(a._id), a.active ?? []]));
  return new Map(
    boards.map((board) => {
      const temporary = mergeApplicableActionEffects(
        combineActiveActionEffects(activeByCountry.get(board.countryId) ?? [], turn)
          .filter((e) => cabinetActionApplies(e.scope, board.scope, board.regionId))
          .filter((e) => /^M\d{2}$/.test(e.target))
      );
      const breakdown = metricPolicyPressure({ board, ...laws, turn, temporary });
      const points = Object.fromEntries(
        Object.entries(breakdown)
          .filter(([, p]) => p.combined !== 0)
          .map(([id, p]) => [id, p.combined])
      );
      return [board._id, points];
    })
  );
}
