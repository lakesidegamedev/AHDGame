export function shouldStartHostedBackgroundServices(
  env: Record<string, string | undefined>
): boolean {
  return env.DISABLE_DEV_BACKGROUND !== "1" && env.SINGLEPLAYER !== "1";
}

/**
 * Should THIS process own the cron schedule?
 *
 * - unset: web owns cron. Default, so nothing changes until a worker exists.
 * - CRON_OWNER=worker: web starts no cron; scripts/turn-worker.ts owns it.
 *
 * Opt-out rather than opt-in: a missing variable must leave web running turns,
 * not leave the world with no turns at all.
 */
export function shouldRunCronInWebProcess(env: Record<string, string | undefined>): boolean {
  return shouldStartHostedBackgroundServices(env) && env.CRON_OWNER !== "worker";
}

/** Is this process the dedicated cron worker? Only `scripts/turn-worker.ts` sets it. */
export function isCronWorkerProcess(env: Record<string, string | undefined>): boolean {
  return env.CRON_OWNER === "worker";
}
