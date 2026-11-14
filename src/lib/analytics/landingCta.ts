/** Which landing call-to-action an anchor destination belongs to. */
export type LandingCta = "register" | "login" | "discord" | "play_free" | "wiki";

/** Classify an anchor's destination into a landing call-to-action, or null. */
export function classifyLandingCta(href: string | null): LandingCta | null {
  if (!href) return null;
  if (/discord\.(gg|com)\//.test(href)) return "discord";
  let path: string;
  try {
    path = new URL(href, "https://ahousedividedgame.com").pathname;
  } catch {
    return null;
  }
  if (path.startsWith("/register")) return "register";
  if (path.startsWith("/login")) return "login";
  if (path.startsWith("/singleplayer") || path.startsWith("/download")) return "play_free";
  if (path.startsWith("/wiki")) return "wiki";
  return null;
}
