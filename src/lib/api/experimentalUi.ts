import { cache } from "react";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { EXPERIMENTAL_UI_COOKIE } from "./experimentalUiCookie";

/**
 * Whether this request should decode pages, for the root template.
 *
 * The cookie is the normal answer: `/api/client-nav` writes it after the
 * player's first load, so later loads and navigations cost nothing. But that
 * first load already rendered before the bootstrap ran, which left the effect
 * off until a reload. When the cookie is missing, fall back to the account
 * record so the page the player landed on decodes too.
 *
 * `getAuthUser` is React-cached for the render and reads the user through the
 * short-TTL process cache, so a signed-in browser that refuses cookies pays at
 * most one cached account read per render.
 */
export const isExperimentalUiEnabled = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  if (cookieStore.get(EXPERIMENTAL_UI_COOKIE)?.value === "1") return true;

  const user = await getAuthUser();
  return user?.experimentalFeatures === true;
});
