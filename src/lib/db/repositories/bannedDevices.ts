import type { Collection, Document } from "mongodb";
import type { BannedDevice } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `bannedDevices` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("bannedDevices")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function bannedDevicesCollection<TSchema extends Document = BannedDevice>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("bannedDevices");
}
