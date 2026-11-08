import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import { unlinkProviderCredential } from "@/lib/auth/providerUnlink";

// POST /api/auth/google/unlink — Removes the Google account link from the authenticated user's profile.
// Auth: requireBasicAuth
// Errors: 400, 401, 404, 409, 429, 503
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
      provider: "google",
      unset: {
        googleId: "",
        googleEmail: "",
        googleName: "",
        googleAvatar: "",
        googleLinkedAt: "",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
