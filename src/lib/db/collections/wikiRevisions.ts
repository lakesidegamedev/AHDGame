import type { Db } from "mongodb";
import type { WikiRevision } from "../types/wikiRevision";

export function getWikiRevisionsCollection(db: Db) {
  return db.collection<WikiRevision>("wikiRevisions");
}
