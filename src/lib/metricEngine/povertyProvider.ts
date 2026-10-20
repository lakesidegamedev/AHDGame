/** Poverty uses the same current statutory funding evidence as other metric owners. */
import type { Db } from "mongodb";
import { loadMetricLawDelivery } from "@/lib/resetMetrics/loadLawDelivery";
import { deliveredMetricEffects } from "@/lib/resetMetrics/rules/lawDelivery";
import type { PovertyPolicyInput } from "./rules/poverty";

export async function loadPovertyPolicyInputs(
  db: Db,
  input: { worldId: string; turn: number; regions: readonly { _id: string; countryId: string }[] }
): Promise<Map<string, PovertyPolicyInput>> {
  if (!input.worldId || !input.regions.length) return new Map();
  const { programs, settlements } = await loadMetricLawDelivery(db, input);
  return new Map(
    input.regions.map((region) => [
      region._id,
      {
        deliveredPressure:
          deliveredMetricEffects(
            programs.filter(
              (p) =>
                p.country === region.countryId &&
                (p.scope === "national" || p.regionId === region._id)
            ),
            settlements,
            input.turn
          )["03"] ?? 0,
      },
    ])
  );
}
