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
  "chart/render",
  "map/render",
  "suggest-questions",
  "action/confirm",
  "action/cancel",
]);

/**
 * Chart and map rendering are Ask's public renderers, not player routes: they
 * sit outside /api/game-ask and the machine secret only lifts their per-IP
 * limit, which every drawer request would otherwise share.
 */
const RENDER_ROUTES = new Set(["chart/render", "map/render"]);

/** Ask path for a drawer route. */
export function askUpstreamPath(route: string): string {
  return RENDER_ROUTES.has(route) ? `/api/${route}` : `/api/game-ask/${route}`;
}

/** Charts carry their data; the rest are questions and ids. */
export function askDrawerBodyLimit(route: string): number {
  return RENDER_ROUTES.has(route) ? 128 * 1024 : 32 * 1024;
}

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
