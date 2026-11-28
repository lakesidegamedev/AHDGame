import type { Collection, Db, Document } from "mongodb";

/** The journal freezes target names; this handle never chooses or creates a new target. */
export function moneyMoveTargetsCollection<T extends Document>(
  db: Db,
  name: string
): Collection<T> {
  return db.collection<T>(name);
}
