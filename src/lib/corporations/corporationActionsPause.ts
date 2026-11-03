/**
 * Why corporation actions are refused world-wide right now, or null. Shared by
 * the `requireCorporationActionsEnabled` guard and by read routes that mark
 * actions unavailable ahead of time, so both say the same thing.
 */
export function corporationActionsPause(
  gameState: { corporationActionsPaused?: boolean; processingKind?: string | null } | null
): { status: number; message: string } | null {
  if (gameState?.processingKind === "stockTaxMigration")
    return { status: 409, message: "Stock holding maintenance is in progress, try again shortly." };
  if (gameState?.processingKind === "economyReset")
    return { status: 409, message: "Economy maintenance is in progress, try again shortly." };
  if (gameState?.corporationActionsPaused) {
    return { status: 403, message: "Corporation actions are currently paused by an admin" };
  }
  return null;
}
