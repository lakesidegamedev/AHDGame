import type { NextResponse } from "next/server";

/**
 * Cookie mirror of `users.experimentalFeatures`, so the server-rendered
 * template can gate the experimental page decode without a database read on
 * every navigation. Read by `app/template.tsx`; written by the routes that
 * already have the user document open.
 */
export const EXPERIMENTAL_UI_COOKIE = "ahd-experimental-ui";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Keep the template's copy of the experimental opt-in in step with the user
 * record. `/api/client-nav` runs once per app load, so a toggle made on
 * another device reaches this browser on its next visit; the settings PATCH
 * runs it immediately, so this browser picks the change up on the next page.
 */
export function applyExperimentalUiCookie(response: NextResponse, enabled: boolean): NextResponse {
  if (enabled) {
    response.cookies.set(EXPERIMENTAL_UI_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  } else {
    response.cookies.delete(EXPERIMENTAL_UI_COOKIE);
  }
  return response;
}
