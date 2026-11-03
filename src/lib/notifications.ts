import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { NotificationType, Notification } from "@/lib/db/types";

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

export async function createNotification(opts: NotificationInput): Promise<void> {
  if (!hasRecipient(opts)) return;
  try {
    const db = await getDb();
    await db.collection<Omit<Notification, "_id">>("notifications").insertOne(toDoc(opts));
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
    await db
      .collection<Omit<Notification, "_id">>("notifications")
      .insertMany(deliverable.map(toDoc));
  } catch (err) {
    console.error("[createNotifications] Failed:", err);
  }
}
