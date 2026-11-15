/** Resolve the active world preset from a gameState-like document. */
export function resolvePresetIdFromGameState(
  gameState: { preset?: string | null } | null | undefined,
  fallback = "2019-default"
): string {
  const preset = gameState?.preset?.trim();
  return preset && preset.length > 0 ? preset : fallback;
}
