import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { getGameState, invalidateGameStateCache } from "@/lib/gameState";

// ─── Fast mode toggle ─────────────────────────────────────────────────────────

export async function toggleFastMode(): Promise<{
  success: boolean;
  message: string;
  fastMode: boolean;
}> {
  try {
    const db = await getDb();
    const gameState = await getGameState(db);

    if (!gameState) {
      return { success: false, message: "Game state not found", fastMode: false };
    }

    const newFastModeState = !gameState.fastMode;

    await (
      await getGameStateCollection(db)
    ).updateOne(
      { _id: "current" },
      { $set: { fastMode: newFastModeState, updatedAt: new Date() } }
    );

    invalidateGameStateCache();

    // Rebuild the schedule if this process owns it; otherwise the worker must restart.
    const { restartCronWithSchedule } = await import("@/lib/cron");
    const restarted = await restartCronWithSchedule();

    console.log(`[Turn System] Fast mode ${newFastModeState ? "enabled" : "disabled"}`);
    return {
      success: true,
      message:
        `Fast mode ${newFastModeState ? "enabled" : "disabled"}. Turns will run ${newFastModeState ? "every 30 minutes" : "every hour"}` +
        (restarted ? "." : " once the turn worker restarts."),
      fastMode: newFastModeState,
    };
  } catch (error) {
    console.error("[Turn System] Error toggling fast mode:", error);
    Sentry.captureException(error, { tags: { component: "turnSystem", op: "toggleFastMode" } });
    return {
      success: false,
      message: `Failed to toggle fast mode: ${error instanceof Error ? error.message : "Unknown error"}`,
      fastMode: false,
    };
  }
}
