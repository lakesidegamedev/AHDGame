import type { ObjectId } from "mongodb";

export const PROVIDER_LINK_HISTORY_COLLECTION = "providerLinkHistory";

export type ProviderLinkHistoryProvider = "apple" | "discord" | "google";
export type ProviderLinkHistoryAction = "link" | "unlink";

/**
 * One row per login-account link or unlink. Holds a keyed hash of the provider
 * subject, never the raw provider id. Kept with the account and removed when
 * the account is deleted.
 */
export interface ProviderLinkHistoryEntry {
  _id?: ObjectId;
  userId: ObjectId;
  provider: ProviderLinkHistoryProvider;
  subjectHash: string;
  action: ProviderLinkHistoryAction;
  at: Date;
}
