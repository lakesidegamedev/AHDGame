/**
 * Which database a cloneFromLive job copies from.
 *
 * Sims never read production. The host restores the newest verified backup
 * into one of two databases, live-snapshot-a or live-snapshot-b, on the
 * LIVE_MONGODB_URI server, checks it, and then points the control-plane
 * document `liveSnapshot` (_id "current") at it. The flip is one document
 * write, so a job resolves either the old complete snapshot or the new one,
 * never a half-restored database.
 */
export interface LiveSnapshotPointer {
  _id: "current";
  dbName?: string;
  swapping?: boolean;
  archive?: string;
  at?: Date;
}

const SNAPSHOT_DB_NAME = /^live-snapshot-[ab]$/;

/** The snapshot database to clone from, or an error that says why a clone must not run. */
export function resolveLiveSnapshotDb(pointer: LiveSnapshotPointer | null): string {
  if (!pointer || !pointer.dbName) {
    throw new Error(
      "cloneFromLive refused: no live snapshot is recorded (control-plane liveSnapshot is missing). " +
        "Clone jobs read only the snapshot restored from the verified backup, never production."
    );
  }
  if (pointer.swapping) {
    throw new Error(
      "cloneFromLive refused: the live snapshot is being refreshed; queue the job again later."
    );
  }
  if (!SNAPSHOT_DB_NAME.test(pointer.dbName)) {
    throw new Error(
      `cloneFromLive refused: liveSnapshot.dbName "${pointer.dbName}" is not live-snapshot-a or live-snapshot-b.`
    );
  }
  return pointer.dbName;
}
