/** Entries kept in `characters.actionGrantLog`: about a day of hourly turns for both grant sources. */
export const ACTION_GRANT_LOG_LIMIT = 48;

/**
 * Update-pipeline expression appending `entry` to `actionGrantLog`, keeping the
 * newest ACTION_GRANT_LOG_LIMIT entries. Put it in the same $set stage as the
 * actions update so `$actions` in the entry still reads the pre-grant balance.
 */
export function appendActionGrantLog(entry: Record<string, unknown>) {
  return {
    $slice: [
      { $concatArrays: [{ $ifNull: ["$actionGrantLog", []] }, [entry]] },
      -ACTION_GRANT_LOG_LIMIT,
    ],
  };
}
