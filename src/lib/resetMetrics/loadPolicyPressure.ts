/** Metric pressure is delivered statute change relative to opening law, plus active Cabinet actions. */
import type { Db } from "mongodb";
import type { ResetCabinetActionState } from "@/lib/resetCabinet/rules/actionState";
import {
  combineActiveActionEffects,
  mergeApplicableActionEffects,
} from "@/lib/resetCabinet/rules/actions";
import { loadMetricLawDelivery } from "./loadLawDelivery";
import { deliveredMetricEffects, metricLawApplies } from "./rules/lawDelivery";
import type { ResetMetricSnapshot } from "./rules/snapshot";

const MAX_COMBINED_POLICY_PRESSURE = 1.2;

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
      (scope === "SCT" && regionId === "SCO") ||
      (scope === "WAL" && regionId === "WAL"))
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
    db
      .collection<ResetCabinetActionState>("resetCabinetActionStates")
      .find({ _id: { $in: countryIds }, worldId }, { projection: { _id: 1, active: 1 } })
      .toArray(),
  ]);
  const activeByCountry = new Map(actions.map((a) => [String(a._id), a.active ?? []]));
  return new Map(
    boards.map((board) => {
      const applies = (p: { country: string; scope: string; regionId?: string }) =>
        (p.scope === "national" || p.scope === "regional") &&
        metricLawApplies({ ...p, scope: p.scope }, board);
      const points = deliveredMetricEffects(laws.programs.filter(applies), laws.settlements, turn);
      // The historical opening already embodies its statutes at full delivery.
      // Subtract that reference once; defunding existing laws must not leave a free opening benefit.
      for (const program of laws.opening.filter(applies))
        for (const effect of program.primaryMetricEffects) {
          points[effect.metricId] =
            (points[effect.metricId] ?? 0) - effect.favorableNormalizedPoints;
        }
      const temporary = mergeApplicableActionEffects(
        combineActiveActionEffects(activeByCountry.get(board.countryId) ?? [], turn)
          .filter((e) => cabinetActionApplies(e.scope, board.scope, board.regionId))
          .filter((e) => /^M\d{2}$/.test(e.target))
      );
      for (const effect of temporary) {
        const id = effect.target.slice(1);
        points[id] = (points[id] ?? 0) + effect.favorableNormalizedPoints;
      }
      for (const id of Object.keys(points)) {
        points[id] = Math.max(
          -MAX_COMBINED_POLICY_PRESSURE,
          Math.min(MAX_COMBINED_POLICY_PRESSURE, Number(points[id]!.toFixed(4)))
        );
        if (points[id] === 0) delete points[id];
      }
      return [board._id, points];
    })
  );
}
