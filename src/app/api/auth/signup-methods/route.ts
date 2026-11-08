import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import type { GameConfig } from "@/lib/db/types";
import { isAppleSignInConfigured } from "@/lib/auth/apple";
import { computeIntakeStatus, type IntakeStatus } from "@/lib/auth/intakeStatus";
import { authConfig } from "@/lib/config/auth";

/**
 * Which ways of signing up actually work on THIS deployment.
 *
 * OAuth buttons and test mode can make a signup method unusable. The server
 * reports availability up front so the page can disable what does not work and
 * say why, instead of sending the player through a redirect to find out.
 */
export interface SignupMethods {
  testMode: boolean;
  discordLinkRequired: boolean;
  /** Email + password. Requires the test secret while `testMode` is on. */
  email: { available: true; requiresTestSecret: boolean };
  discord: { available: boolean; reason: "not_configured" | "test_mode" | null };
  google: { available: boolean; reason: "not_configured" | "test_mode" | null };
  apple: { available: boolean; reason: "not_configured" | "test_mode" | null };
  /** Whether new accounts are accepted at all right now, and why not. */
  registration: IntakeStatus["registration"];
  /** Expected reopen time while maintenance is on, else null. */
  expectedEnd: string | null;
}

// GET /api/auth/signup-methods — Which registration methods this deployment supports.
// Auth: public
// Errors: (none)
export async function GET() {
  try {
    const db = await getDb();
    const config = await db.collection<GameConfig>("gameConfig").findOne(
      { _id: "default" },
      {
        projection: {
          testMode: 1,
          discordLinkRequiredForCharacter: 1,
          maintenanceMode: 1,
          registrationEnabled: 1,
          maintenanceExpectedEnd: 1,
        },
      }
    );
    const testMode = config?.testMode === true;
    const intake = computeIntakeStatus(config);

    const discordConfigured = Boolean(
      authConfig.discordClientId() && authConfig.discordRedirectUri()
    );
    const googleConfigured = Boolean(authConfig.googleClientId() && authConfig.googleRedirectUri());

    const appleConfigured = isAppleSignInConfigured();

    const body: SignupMethods = {
      testMode,
      discordLinkRequired: config?.discordLinkRequiredForCharacter === true,
      email: { available: true, requiresTestSecret: testMode },
      // Test mode blocks new OAuth registrations in every callback route, and
      // unlike email signup there is no secret-bearing path through them.
      discord: {
        available: discordConfigured && !testMode,
        reason: !discordConfigured ? "not_configured" : testMode ? "test_mode" : null,
      },
      google: {
        available: googleConfigured && !testMode,
        reason: !googleConfigured ? "not_configured" : testMode ? "test_mode" : null,
      },
      apple: {
        available: appleConfigured && !testMode,
        reason: !appleConfigured ? "not_configured" : testMode ? "test_mode" : null,
      },
      registration: intake.registration,
      expectedEnd: intake.expectedEnd,
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleRouteError(error);
  }
}
