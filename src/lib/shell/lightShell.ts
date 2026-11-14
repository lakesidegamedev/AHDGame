/**
 * The light shell: signed-out visitors on the landing and sign-in pages get the
 * root layout without the always-mounted chrome that has no job there (status
 * bar, signed-in gates, ask drawer, tutorial coach and similar). Those
 * components return nothing on these paths, but mounting them still ships and
 * hydrates their code.
 *
 * The root layout does not re-render on client navigation, so a light shell must
 * never outlive the page that chose it: leaving the light paths is a full page
 * load (see `LightShellGuard`).
 */
export const LIGHT_SHELL_PATHS = ["/", "/login"] as const;

export function isLightShellPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (LIGHT_SHELL_PATHS as readonly string[]).includes(normalized);
}

export interface LightShellInput {
  pathname: string;
  hasSessionCookie: boolean;
  singleplayer: boolean;
  isWikiSubdomain: boolean;
  isNativeApp: boolean;
  isClientShell: boolean;
  isStoreApp: boolean;
}

/** Only an anonymous browser visit on a light path. Apps and shells keep the full layout. */
export function shouldUseLightShell(input: LightShellInput): boolean {
  return (
    !input.hasSessionCookie &&
    !input.singleplayer &&
    !input.isWikiSubdomain &&
    !input.isNativeApp &&
    !input.isClientShell &&
    !input.isStoreApp &&
    isLightShellPath(input.pathname)
  );
}

/**
 * Where a click on a link should load as a full document, or null to leave it to
 * the router. Links that stay inside the light set, leave the origin, or point at
 * the current URL are left alone.
 */
export function hardNavigationTarget(
  href: string,
  current: { origin: string; href: string }
): string | null {
  let url: URL;
  try {
    url = new URL(href, current.href);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  if (isLightShellPath(url.pathname)) return null;
  if (url.href === current.href) return null;
  return url.href;
}
