import type { ObjectId } from "mongodb";

export type BannedDeviceKind = "deviceKey" | "trackingId" | "fingerprint";

/**
 * One row per banned device signal in the `bannedDevices` collection.
 * Unlike a users-doc match, these rows outlive account deletion, so a banned
 * player cannot register again from the same browser after self-deleting.
 */
export interface BannedDevice {
  _id: ObjectId;
  kind: BannedDeviceKind;
  value: string;
  reason: string;
  bannedAt: Date;
  bannedBy: string;
}
