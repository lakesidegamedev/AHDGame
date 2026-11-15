import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { clearAuthCookie, verifyAuth } from "@/lib/auth";
import { credentialSessionIsCurrent } from "@/lib/auth/credentialSession";
import { withNoStore } from "@/lib/api/withNoStore";
import { createAdminLog } from "@/lib/adminLog";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { cascadeCharacterDeletion } from "@/lib/account/cascadeCharacterDeletion";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { isAuthMigrationFenced } from "@/lib/auth/sourceFence";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";
import { cleanupCaucusParticipationForCharacters } from "@/lib/caucus/cleanupCaucusParticipationForCharacters";
import { logCharacterDeleted } from "@/lib/db/collections/activityLog";
import {
  getAppleSignInConfig,
  openAppleRefreshToken,
  revokeAppleRefreshToken,
} from "@/lib/auth/apple";
import { heldBlocRowIds, releaseVacatedBlocSeats } from "@/lib/elections/vacatedBlocSeats";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import type { Document } from "mongodb";
import {
  CENTRAL_WRITE_UNAVAILABLE_MESSAGE,
  centralWriteFirst,
  shadowMirrorWrite,
} from "@/lib/auth/centralLogin";
import { usersCollection } from "@/lib/db/repositories/users";
import { actionLogsCollection } from "@/lib/db/repositories/actionLogs";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";
import { retiredCharactersCollection } from "@/lib/db/repositories/retiredCharacters";
import { identityObservationsCollection } from "@/lib/db/repositories/identityObservations";

// DELETE /api/auth/delete-account — Permanently deletes the authenticated user's account, character, and clears offices held.
// Auth: requireBasicAuth
// Errors: 400, 401, 404, 429
export const DELETE = withNoStore(async () => {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const userId = auth.user.userId;

    const rateLimit = checkRateLimit(`api/auth/delete-account:${userId}`, 10, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const objectId = new ObjectId(userId);
    const db = await getDb();
    const usersCollectionHandle = usersCollection(db);
    const charactersHandle = charactersCollection(db);
    const actionLogsHandle = actionLogsCollection<Document>(db);
    const officialsCollection = electedOfficialsCollection<Document>(db);

    // Verify user exists
    const user = await usersCollectionHandle.findOne({ _id: objectId });
    if (!user) {
      return errorResponse(404, "User not found");
    }
    // Reject accounts already fenced before starting legacy deletion.
    // This pre-read does not serialize deletion with concurrent fence acquisition.
    if (isAuthMigrationFenced(user)) {
      return errorResponse(
        409,
        "Your account changed during this request. Please sign in and try again."
      );
    }
    // Recheck the verified session against the fresh account before any
    // destructive work. The shared account cache is not sufficient here.
    if (!credentialSessionIsCurrent(userId, user, await verifyAuth())) {
      return errorResponse(401, "Authentication required");
    }
    if (user.isAdmin === true || user.role === "admin") {
      return errorResponse(
        400,
        "Admin accounts cannot be self-deleted. Please contact another admin."
      );
    }

    // Central mode removes the central account before any local destructive work.
    if (!(await centralWriteFirst({ op: "account-delete", ahdUserId: userId }))) {
      return errorResponse(503, CENTRAL_WRITE_UNAVAILABLE_MESSAGE);
    }

    // Find the user's character
    const character = await charactersHandle.findOne({ userId: objectId });

    // Log account self-deletion with tracking data (before actually deleting)
    // WHY: Self-deleted alt accounts lose all IP/fingerprint data — this preserves an audit trail for fraud investigation
    await createAdminLog({
      category: "account",
      action: "account_deleted_self",
      username: user.username,
      characterName: character?.name,
      details: [
        user.registrationIp && `regIp: ${user.registrationIp}`,
        user.lastKnownIp && `lastIp: ${user.lastKnownIp}`,
        user.trackingId && `trackingId: ${user.trackingId}`,
        user.deviceKey && `deviceKey: ${user.deviceKey}`,
        user.fingerprintHistory?.length && `fingerprints: ${user.fingerprintHistory.join(", ")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    });

    // If character exists, clear any elected offices they hold
    if (character) {
      const now = new Date();

      const blocRowIds = await heldBlocRowIds(db, { characterId: character._id });
      await officialsCollection.updateMany(
        { characterId: character._id },
        {
          $set: {
            characterId: null,
            characterName: null,
            party: null,
            updatedAt: new Date(),
          },
        }
      );
      await releaseVacatedBlocSeats(db, blocRowIds, new Date());

      await cleanupCaucusParticipationForCharacters(db, [character._id], {
        removeMembership: true,
        membershipStatus: "removed",
        now,
      });

      // Release any corporation shareholder positions to publicFloat and vacate
      // any CEO seat held by this character BEFORE deleting the character row,
      // so we don't leave orphaned holdings under a hard-deleted _id.
      await cascadeCharacterDeletion(db, character._id);

      // Retain action logs for forensics: stamp them deleted + denormalize
      // identity from the still-present docs so they stay readable afterward.
      await actionLogsHandle.updateMany(
        { characterId: character._id },
        {
          $set: {
            characterDeletedAt: now,
            characterName: character.name,
            username: user.username,
            countryId: (character as { countryId?: string }).countryId,
          },
        }
      );

      // Phase 4: stamp tx history before deleting the character doc so admin
      // forensic queries still resolve subjectName/sequentialId after the
      // entity is gone. The user-initiated account-self-delete path is the
      // most common way wealth-list players try to scrub their trail.
      await stampSubjectDeleted(db, character._id, {
        sequentialId: character.sequentialId,
        deletedAt: now,
      });

      // Snapshot the deletion into activityLog before the character doc is gone.
      await logCharacterDeleted(db, {
        reason: "self_delete",
        userId: objectId,
        username: user.username,
        characterId: character._id,
        characterName: character.name as string,
        countryId: (character as { countryId?: string }).countryId as never,
        details: {
          party: (character as { party?: string }).party ?? null,
          highestOffice: (character as { highestOffice?: string }).highestOffice ?? null,
          registrationIp: user.registrationIp ?? null,
          lastKnownIp: user.lastKnownIp ?? null,
          trackingId: user.trackingId ?? null,
          deviceKey: user.deviceKey ?? null,
          fingerprintCount: user.fingerprintHistory?.length ?? 0,
        },
      });

      // Delete the character
      await charactersHandle.deleteOne({ _id: character._id });
    }

    if (!character) {
      await logCharacterDeleted(db, {
        reason: "self_delete",
        userId: objectId,
        username: user.username,
        details: {
          registrationIp: user.registrationIp ?? null,
          lastKnownIp: user.lastKnownIp ?? null,
          trackingId: user.trackingId ?? null,
          deviceKey: user.deviceKey ?? null,
          fingerprintCount: user.fingerprintHistory?.length ?? 0,
        },
      });
    }

    // Delete retired characters and achievements for this user
    await retiredCharactersCollection<Document>(db).deleteMany({ userId: objectId });
    await characterAchievementsCollection<Document>(db).deleteMany({ userId: objectId });

    // Identity history lives in its own collection, so deleting the user row
    // does NOT take it with it. Purged here so account deletion actually
    // removes the account's IP and fingerprint evidence rather than orphaning
    // 90 days of it.
    await identityObservationsCollection<Document>(db).deleteMany({ userId: objectId });

    // App Store rule 5.1.1(v): deleting an account created or linked with
    // Sign in with Apple must revoke the Apple grant. Best effort, so an
    // Apple outage never blocks the deletion itself.
    await revokeAppleGrantForDeletion(user.appleRefreshToken);

    // Delete the user
    await usersCollectionHandle.deleteOne({ _id: objectId });
    shadowMirrorWrite({ op: "account-delete", ahdUserId: userId });

    await clearAuthCookie("user_delete_account");

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    return handleRouteError(error);
  }
});

async function revokeAppleGrantForDeletion(sealed: string | undefined): Promise<void> {
  const refreshToken = openAppleRefreshToken(sealed);
  const config = getAppleSignInConfig();
  if (!refreshToken || !config) return;
  try {
    if (!(await revokeAppleRefreshToken(config, refreshToken))) {
      console.error("[delete-account] Apple token revocation was rejected");
    }
  } catch {
    console.error("[delete-account] Apple token revocation is unavailable");
  }
}
