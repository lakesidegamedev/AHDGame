import type { Collection, Document } from "mongodb";
import type { CabinetSetting } from "../types";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `cabinetSettings` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("cabinetSettings")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function cabinetSettingsCollection<TSchema extends Document = CabinetSetting>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("cabinetSettings");
}
