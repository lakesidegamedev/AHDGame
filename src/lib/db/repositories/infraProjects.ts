import type { Collection, Document } from "mongodb";
import type { InfraProject } from "../types/infraProject";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `infraProjects` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("infraProjects")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function infraProjectsCollection<TSchema extends Document = InfraProject>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("infraProjects");
}
