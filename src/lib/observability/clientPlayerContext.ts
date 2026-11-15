/**
 * The signed-in player's opaque identifiers for browser error reports.
 *
 * Kept outside the Sentry SDK so the auth provider can record them without
 * pulling the lazily loaded SDK into the first-paint bundle. `beforeSend`
 * reads them when an error is actually reported. Only opaque ids and the
 * country leave the browser: no name, username, email or IP.
 */
export interface ClientPlayerContext {
  userId: string;
  characterId?: string;
  countryId?: string;
  staff?: boolean;
}

let current: ClientPlayerContext | null = null;

/** Record (or clear, with null) the signed-in player for later error reports. */
export function setClientPlayerContext(ctx: ClientPlayerContext | null): void {
  current = ctx && ctx.userId ? { ...ctx } : null;
}

export function getClientPlayerContext(): ClientPlayerContext | null {
  return current;
}

/** Derive the context from the /api/client-nav user payload. */
export function playerContextFromAuthUser(user: unknown): ClientPlayerContext | null {
  if (!user || typeof user !== "object") return null;
  const u = user as {
    id?: unknown;
    isAdmin?: unknown;
    isModerator?: unknown;
    character?: { id?: unknown; countryId?: unknown } | null;
  };
  if (typeof u.id !== "string" || !u.id) return null;
  const characterId = typeof u.character?.id === "string" ? u.character.id : undefined;
  const countryId = typeof u.character?.countryId === "string" ? u.character.countryId : undefined;
  return {
    userId: u.id,
    ...(characterId ? { characterId } : {}),
    ...(countryId ? { countryId } : {}),
    staff: u.isAdmin === true || u.isModerator === true,
  };
}
