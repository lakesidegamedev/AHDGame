import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { openingCabinetActionStates } from "./rules/actionState";
import { resetActionsForSeat } from "./catalog";
import { activateAction } from "./rules/actions";
import { loadCabinetGameplayEffects } from "./loadGameplayEffects";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";

it("loads Canadian Cabinet effects through an actual preset-aware projected read", async () => {
  const memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      preset: "2027-default",
      currentTurn: 2,
      resetWorldId: "ca-actions",
      metricsSystemVersion: "v2",
      cabinetSystemVersion: "v2",
      resetVersionSeeds: Object.fromEntries(
        (["metrics", "cabinet"] as const).map((key) => [
          key,
          {
            worldId: "ca-actions",
            revision: RESET_V2_SEED_REVISION[key],
            sourceTurn: 1,
            completedAt: "2026-11-14",
            verificationHash: "verified",
            countries: ["US", "CA"],
          },
        ])
      ),
    },
  ]);
  const state = openingCabinetActionStates("ca-actions", 1, ["CA"])[0]!;
  const choice = resetActionsForSeat("CA", "minister_of_finance").find(
    (a) => a.costClass === "Staff"
  )!;
  memory.seed("resetCabinetActionStates", [{ ...state, active: [activateAction(choice, 1)] }]);
  const effects = await loadCabinetGameplayEffects(memory as unknown as Db);
  expect(effects.length).toBeGreaterThan(0);
  expect(effects.every((effect) => effect.country === "CA")).toBe(true);
});
