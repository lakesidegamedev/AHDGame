import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import { unlinkProviderCredential } from "@/lib/auth/providerUnlink";
import type { GameConfig } from "@/lib/db/types";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

// POST /api/auth/discord/unlink - Removes the Discord account link from the authenticated user's profile.
// Auth: requireBasicAuth
// Errors: 400, 401, 403, 404, 409, 429, 503
// Every path is per-account: withNoStore stamps the early rate-limit and
// outer error responses that carry no explicit Cache-Control header.
export const POST = withNoStore(async function POST() {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) {
      auth.response.headers.set("Cache-Control", "private, no-store");
      return auth.response;
    }

    return await unlinkProviderCredential(auth.user.userId, {
      provider: "discord",
      unset: {
        discordId: "",
        discordUsername: "",
        discordAvatar: "",
        discordLinkedAt: "",
      },
      beforeWrite: async (db) => {
        const config = await gameConfigCollection(db).findOne(
          { _id: "default" },
          { projection: { discordLinkRequiredForCharacter: 1 } }
        );
        if (config?.discordLinkRequiredForCharacter !== true) return null;
        return errorResponse(
          403,
          "Discord cannot be unlinked while Discord for new characters is enabled.",
          { headers: { "Cache-Control": "private, no-store" } }
        );
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
