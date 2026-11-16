import type { Db } from "mongodb";
import { PROVIDER_LINK_HISTORY_COLLECTION } from "@/lib/db/types/providerLinkHistory";
import { ensureIndex } from "./helpers";

export async function seedProviderLinkHistoryIndexes(db: Db, log: (msg: string) => void) {
  log("Provider link history indexes:");

  await ensureIndex(
    db,
    PROVIDER_LINK_HISTORY_COLLECTION,
    { userId: 1, at: -1 },
    { background: true, name: "providerLinkHistory_user_at" },
    log
  );

  await ensureIndex(
    db,
    PROVIDER_LINK_HISTORY_COLLECTION,
    { subjectHash: 1, provider: 1 },
    { background: true, name: "providerLinkHistory_subjectHash_provider" },
    log
  );

  log("Provider link history indexes ensured");
}
