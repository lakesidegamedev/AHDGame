import { z } from "zod";
import { schemas } from "../validate";
import { NOTIFICATION_TYPES } from "@/lib/db/types/notifications";
import { BULK_READ_MAX_IDS } from "@/lib/inbox/bulkRead";

export const notificationsPatchSchema = z.object({
  id: schemas.objectId.optional(),
  /** Bulk mark-read for the listed notifications (read only; one request instead of one per item). */
  ids: z.array(schemas.objectId).min(1).max(BULK_READ_MAX_IDS).optional(),
  /** When marking all read, limit to this bundled account (must be in bundle). */
  forUserId: schemas.objectId.optional(),
  /** When marking all read, limit to notifications tagged for this character (metadata.recipientCharacterId). */
  forCharacterId: schemas.objectId.optional(),
  action: z.enum(["read", "archive", "unarchive", "snooze", "unsnooze"]).optional(),
  snoozeMinutes: z
    .number()
    .int()
    .min(5)
    .max(7 * 24 * 60)
    .optional(),
});

export const notificationPreferenceActionSchema = z.union([
  z.object({ action: z.literal("mail"), muted: z.boolean() }),
  z.object({
    action: z.enum(["mute", "unmute", "snooze", "unsnooze"]),
    type: z.enum(NOTIFICATION_TYPES),
  }),
]);
