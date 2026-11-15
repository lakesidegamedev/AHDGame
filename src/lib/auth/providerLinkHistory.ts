import { createHmac } from "crypto";
import type { Document, ObjectId } from "mongodb";
import { authConfig } from "@/lib/config/auth";
import type { CollectionSource } from "@/lib/db/repositories/source";
import { bannedDevicesCollection } from "@/lib/db/repositories/bannedDevices";
import { providerLinkHistoryCollection } from "@/lib/db/repositories/providerLinkHistory";
import type {
  ProviderLinkHistoryAction,
  ProviderLinkHistoryProvider,
} from "@/lib/db/types/providerLinkHistory";
import { appleExemptionHolds } from "@/lib/auth/rules/providerLinkHistory";

const KEY_DOMAIN = "ahd-provider-subject-hash-v1";

const PROVIDER_FIELD = {
  apple: "appleId",
  discord: "discordId",
  google: "googleId",
} as const satisfies Record<ProviderLinkHistoryProvider, string>;

export const PROVIDER_LINK_HISTORY_PROVIDERS = ["apple", "discord", "google"] as const;

/**
 * Keyed one-way hash of a provider subject. Null when there is no id or no
 * server secret, so callers skip recording rather than store anything weaker.
 */
export function providerSubjectHash(
  provider: ProviderLinkHistoryProvider,
  providerId: string | null | undefined
): string | null {
  const secret = authConfig.authSecret();
  if (!secret || !providerId) return null;
  const key = createHmac("sha256", secret).update(KEY_DOMAIN).digest();
  return createHmac("sha256", key).update(`${provider}:${providerId}`).digest("hex").slice(0, 32);
}

/** Best effort: a history write must never fail a link, unlink or login. */
export async function recordProviderLinkEvent(
  db: CollectionSource,
  input: {
    userId: ObjectId;
    provider: ProviderLinkHistoryProvider;
    providerId: string | null | undefined;
    action: ProviderLinkHistoryAction;
    at?: Date;
  }
): Promise<void> {
  try {
    const subjectHash = providerSubjectHash(input.provider, input.providerId);
    if (!subjectHash) return;
    await providerLinkHistoryCollection<Document>(db).insertOne({
      userId: input.userId,
      provider: input.provider,
      subjectHash,
      action: input.action,
      at: input.at ?? new Date(),
    });
  } catch {
    // Evidence is optional; the auth flow it observes is not.
  }
}

/** True when this provider subject belongs to a banned account. */
export async function isProviderSubjectBanned(
  db: CollectionSource,
  provider: ProviderLinkHistoryProvider,
  providerId: string | null | undefined
): Promise<boolean> {
  const value = providerSubjectHash(provider, providerId);
  if (!value) return false;
  const row = await bannedDevicesCollection<Document>(db).findOne(
    { kind: provider, value },
    { projection: { _id: 1 } }
  );
  return row !== null;
}

type ProviderIds = Partial<Record<(typeof PROVIDER_FIELD)[ProviderLinkHistoryProvider], unknown>>;

function linkedSubjectHashes(
  account: ProviderIds
): { kind: ProviderLinkHistoryProvider; value: string }[] {
  const rows: { kind: ProviderLinkHistoryProvider; value: string }[] = [];
  for (const provider of PROVIDER_LINK_HISTORY_PROVIDERS) {
    const raw = account[PROVIDER_FIELD[provider]];
    const value = typeof raw === "string" ? providerSubjectHash(provider, raw) : null;
    if (value) rows.push({ kind: provider, value });
  }
  return rows;
}

/** Remember each linked login account of a banned user. */
export async function banProviderSubjects(
  db: CollectionSource,
  account: ProviderIds,
  ban: { reason: string; bannedBy: string; bannedAt: Date }
): Promise<void> {
  const rows = linkedSubjectHashes(account);
  if (rows.length === 0) return;
  await bannedDevicesCollection<Document>(db).bulkWrite(
    rows.map(({ kind, value }) => ({
      updateOne: {
        filter: { kind, value },
        update: {
          $setOnInsert: {
            kind,
            value,
            reason: ban.reason,
            bannedAt: ban.bannedAt,
            bannedBy: ban.bannedBy,
          },
        },
        upsert: true,
      },
    }))
  );
}

/** Lift the login-account bans of an unbanned user. */
export async function unbanProviderSubjects(
  db: CollectionSource,
  account: ProviderIds
): Promise<void> {
  const rows = linkedSubjectHashes(account);
  if (rows.length === 0) return;
  await bannedDevicesCollection<Document>(db).deleteMany({
    $or: rows.map(({ kind, value }) => ({ kind, value })),
  });
}

/**
 * Whether an account's Apple link still exempts it from the Discord gate.
 * False when it has no Apple link or the Apple ID was linked to another
 * account before.
 */
export async function appleExemptsDiscordGate(
  db: CollectionSource,
  userId: ObjectId,
  appleId: string | null | undefined
): Promise<boolean> {
  if (!appleId?.trim()) return false;
  const subjectHash = providerSubjectHash("apple", appleId);
  // No server secret: keep the exemption as it was before link history rather than take it from every Apple player.
  if (!subjectHash) return true;
  const earliest = await providerLinkHistoryCollection<Document>(db)
    .find(
      { provider: "apple", subjectHash },
      { projection: { userId: 1, subjectHash: 1, action: 1, at: 1 }, sort: { at: 1 }, limit: 1 }
    )
    .toArray();
  return appleExemptionHolds(
    userId.toHexString(),
    subjectHash,
    earliest.map((row) => ({
      userId: String(row.userId),
      subjectHash: String(row.subjectHash),
      action: row.action === "unlink" ? "unlink" : "link",
      at: row.at instanceof Date ? row.at.getTime() : 0,
    }))
  );
}
