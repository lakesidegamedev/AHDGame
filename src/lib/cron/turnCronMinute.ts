/**
 * Which minute of the hour (UTC) a world takes its turn.
 *
 * Two worlds on one host should not take their turns at the same moment: a turn
 * is heavy on CPU and disk, and two at once slow both. `TURN_CRON_MINUTE=30`
 * moves a world's turn to :30 and its backup tick to :00.
 *
 * Only 0 and 30 are allowed. Every other schedule in cron.ts (the :15/:45
 * market tick, the :07/:22/:37/:52 share-fill sweep, fast mode's :00/:30) is
 * placed relative to the turn and the half-hour tick, and a half-hour shift
 * maps each of those sets onto itself. Any other minute would put them on top
 * of a turn.
 */
export type TurnCronMinute = 0 | 30;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function resolveTurnCronMinute(
  env: { TURN_CRON_MINUTE?: string } = process.env
): TurnCronMinute {
  const raw = env.TURN_CRON_MINUTE?.trim();
  if (!raw) return 0;
  if (raw === "0" || raw === "00") return 0;
  if (raw === "30") return 30;
  console.warn(`[Cron] TURN_CRON_MINUTE=${raw} is not 0 or 30; using 0`);
  return 0;
}

/** Primary turn schedule. Fast mode runs at both :00 and :30 whatever the minute. */
export function turnCronSchedule(minute: TurnCronMinute, fastMode?: boolean): string {
  return fastMode ? "0,30 * * * *" : `${minute} * * * *`;
}

/** Backup turn (and half-hour tick) schedule: half an hour after the turn. */
export function backupTurnSchedule(minute: TurnCronMinute): string {
  return `${(minute + 30) % 60} * * * *`;
}

/**
 * Index of the turn hour containing `date`: the hour that starts at the turn
 * minute. With the turn at :00 this is the clock hour; with it at :30 an hour
 * runs from :30 to the next :30, so the backup tick at :00 still falls in the
 * same turn hour as the turn it backs up.
 */
export function turnHourBucket(date: Date, minute: TurnCronMinute): number {
  return Math.floor((date.getTime() - minute * MINUTE_MS) / HOUR_MS);
}

/** The first scheduled turn strictly after `now`. */
export function nextScheduledTurnAfter(
  now: Date,
  minute: TurnCronMinute,
  fastMode?: boolean
): Date {
  const stepMs = fastMode ? HOUR_MS / 2 : HOUR_MS;
  const offsetMs = fastMode ? 0 : minute * MINUTE_MS;
  const slot = Math.floor((now.getTime() - offsetMs) / stepMs) + 1;
  return new Date(slot * stepMs + offsetMs);
}
