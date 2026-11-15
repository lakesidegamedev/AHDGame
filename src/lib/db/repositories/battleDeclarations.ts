import type { Collection, Document } from "mongodb";
import type { BattleDeclarationDoc } from "../types/battleDeclaration";
import type { CollectionSource } from "./source";

/**
 * Typed handle on the `battleDeclarations` collection. Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("battleDeclarations")` anywhere else. Pass a document type only when
 * a call site deliberately reads a narrower shape.
 */
export function battleDeclarationsCollection<TSchema extends Document = BattleDeclarationDoc>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("battleDeclarations");
}
