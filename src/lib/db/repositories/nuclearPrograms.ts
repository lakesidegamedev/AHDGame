import type { Collection, Document } from "mongodb";
import type { NuclearProgram } from "../types/nuclearProgram";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `nuclearPrograms` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("nuclearPrograms")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function nuclearProgramsCollection<TSchema extends Document = NuclearProgram>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("nuclearPrograms");
}
