/** Read world-bound prior-turn metric owners once for causal gameplay consumers. */
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import type { ResetMetricSnapshot } from "./rules/snapshot";
import { ownedLegacyValues } from "./rules/ownedInputs";
import { primaryMetrics } from "./catalog";

export async function loadOwnedMetricInputs(db: Db, turn?: number) {
  const game = await db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      projection: {
        currentTurn: 1,
        resetWorldId: 1,
        resetVersionSeeds: 1,
        metricsSystemVersion: 1,
        preset: 1,
        currentYear: 1,
      },
    }
  );
  const rows = game?.resetWorldId
    ? await db
        .collection<ResetMetricSnapshot>("resetMetricSnapshots")
        .find(
          {
            worldId: game.resetWorldId,
            scope: "regional",
            asOfTurn: { $gte: (turn ?? game.currentTurn) - 1, $lte: turn ?? game.currentTurn },
          },
          {
            projection: {
              _id: 1,
              countryId: 1,
              regionId: 1,
              asOfTurn: 1,
              ...Object.fromEntries(
                primaryMetrics.flatMap((m) =>
                  ["metricId", "path", "value", "status"].map((field) => [
                    `observations.${m.id}.${field}`,
                    1,
                  ])
                )
              ),
              priorValues: 1,
            },
          }
        )
        .toArray()
    : [];
  return new Map(
    rows
      .filter(
        (b) => resetSystemVersionsForCountry(game, RESET_V2_READY, b.countryId).metrics === "v2"
      )
      .filter((b) => turn === undefined || b.asOfTurn < turn || b.priorValues !== undefined)
      .map((b) => {
        const observations =
          turn !== undefined && b.asOfTurn === turn
            ? Object.fromEntries(
                Object.entries(b.observations).map(([id, o]) => [
                  id,
                  { ...o, value: b.priorValues?.[id] ?? o.value },
                ])
              )
            : b.observations;
        return [
          b.regionId!,
          {
            countryId: b.countryId,
            asOfTurn: b.asOfTurn,
            observations,
            values: ownedLegacyValues(observations),
            year: game?.currentYear ?? 1991,
          },
        ] as const;
      })
  );
}
