// Server-side connection from the game to the Ask service for the Ask drawer.
//
// The player is authenticated here with their game session. The request is
// forwarded to Ask's /api/game-ask/* routes with the shared machine secret and
// the player's user id; Ask reads their entitlement from the account itself.
// The same identity the Ask website uses means one history and one daily
// allowance across both.

export const ASK_SITE_URL = "https://ask.lakesidegames.net";

/** Drawer paths the game forwards, matching Ask's /api/game-ask whitelist. */
export const ASK_DRAWER_ROUTES = new Set([
  "me",
  "ask",
  "ask/stop",
  "nextcost",
  "conversations",
  "conversation",
  "conversation/delete",
  "conversation/rename",
  "conversation/pin",
  "answer/feedback",
]);

export interface AskServiceConfig {
  baseUrl: string;
  secret: string;
}

/** Null when the drawer is not connected on this deployment. */
export function askServiceConfig(): AskServiceConfig | null {
  const secret = process.env.ASK_DRAWER_SECRET?.trim();
  if (!secret) return null;
  const baseUrl = (process.env.ASK_DRAWER_URL?.trim() || ASK_SITE_URL).replace(/\/+$/, "");
  return { baseUrl, secret };
}

export function askDrawerRoute(segments: readonly string[] | undefined): string | null {
  const route = (segments ?? []).join("/");
  return ASK_DRAWER_ROUTES.has(route) ? route : null;
}
