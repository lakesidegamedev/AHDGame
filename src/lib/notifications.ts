import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { NotificationType, Notification } from "@/lib/db/types";
import { notificationsCollection } from "@/lib/db/repositories/notifications";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export interface NotificationInput {
  userId: ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * NPP-run corporations carry this placeholder owner. No player signs in as
 * it, so anything written to it is a wasted turn-time insert (the contract
 * book alone sent it tens of thousands of alerts a week).
 */
const SYSTEM_USER_ID = "000000000000000000000000";

function hasRecipient(input: NotificationInput): boolean {
  return Boolean(input.userId) && input.userId.toString() !== SYSTEM_USER_ID;
}

/**
 * Alerts are player copy, which never uses em or en dashes. Producers are
 * spread across the codebase, so the rule is applied once where every alert
 * is stored: a spaced dash becomes a colon in titles and a comma in messages,
 * and a dash between numbers becomes a hyphen.
 */
export function plainDashes(text: string, kind: "title" | "message"): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2")
    .replace(/\s+[\u2013\u2014]\s+/g, kind === "title" ? ": " : ", ")
    .replace(/[\u2013\u2014]/g, kind === "title" ? ": " : ", ");
}

function toDoc(input: NotificationInput): Omit<Notification, "_id"> {
  return {
    userId: input.userId,
    type: input.type,
    title: plainDashes(input.title, "title"),
    message: plainDashes(input.message, "message"),
    read: false,
    metadata: input.metadata,
    createdAt: new Date(),
  };
}

/**
 * A corporation alert belongs to the character who runs the corporation, not
 * to every character on the account. Stamps the recipient character from the
 * corporation's CEO when the alert is addressed to the owning account and the
 * producer did not already name a character. Lookup failures leave the alert
 * account-wide rather than losing it.
 */
async function stampCorporationOwners(
  db: Awaited<ReturnType<typeof getDb>>,
  inputs: NotificationInput[]
): Promise<NotificationInput[]> {
  const corpIds = new Set<string>();
  for (const input of inputs) {
    const id = input.metadata?.corporationId;
    if (typeof id === "string" && ObjectId.isValid(id) && !input.metadata?.recipientCharacterId) {
      corpIds.add(id);
    }
  }
  if (corpIds.size === 0) return inputs;
  try {
    const corps = await corporationsCollection(db)
      .find(
        { _id: { $in: [...corpIds].map((id) => new ObjectId(id)) } },
        { projection: { _id: 1, userId: 1, ceoId: 1, ceoType: 1, ceoVacant: 1 } }
      )
      .toArray();
    const owners = new Map<string, { userId: string; characterId: string }>();
    for (const corp of corps) {
      if (corp.ceoVacant || !corp.ceoId || !corp.userId) continue;
      if (corp.ceoType && corp.ceoType !== "character") continue;
      owners.set(corp._id.toString(), {
        userId: corp.userId.toString(),
        characterId: corp.ceoId.toString(),
      });
    }
    return inputs.map((input) => {
      const id = input.metadata?.corporationId;
      if (typeof id !== "string" || input.metadata?.recipientCharacterId) return input;
      const owner = owners.get(id);
      if (!owner || owner.userId !== input.userId.toString()) return input;
      return {
        ...input,
        metadata: { ...input.metadata, recipientCharacterId: owner.characterId },
      };
    });
  } catch (err) {
    console.error("[stampCorporationOwners] Failed:", err);
    return inputs;
  }
}

export async function createNotification(opts: NotificationInput): Promise<void> {
  if (!hasRecipient(opts)) return;
  try {
    const db = await getDb();
    const [stamped] = await stampCorporationOwners(db, [opts]);
    await notificationsCollection<Omit<Notification, "_id">>(db).insertOne(toDoc(stamped!));
  } catch (err) {
    // Non-fatal — log but don't crash the caller
    console.error("[createNotification] Failed:", err);
  }
}

/**
 * Batch insert notifications. Use when a single turn-phase or write path
 * needs to notify many recipients — collect inputs into an array and call
 * once instead of looping createNotification (one DB round-trip vs. N).
 *
 * Empty arrays are a no-op. Failures are swallowed and logged so the caller
 * does not crash a turn over a notification side effect.
 */
export async function createNotifications(inputs: NotificationInput[]): Promise<void> {
  const deliverable = inputs.filter(hasRecipient);
  if (deliverable.length === 0) return;
  try {
    const db = await getDb();
    const stamped = await stampCorporationOwners(db, deliverable);
    await notificationsCollection<Omit<Notification, "_id">>(db).insertMany(stamped.map(toDoc));
  } catch (err) {
    console.error("[createNotifications] Failed:", err);
  }
}
