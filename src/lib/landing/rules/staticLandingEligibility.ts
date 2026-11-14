import { shouldUseLightShell, type LightShellInput } from "@/lib/shell/lightShell";

export interface StaticLandingInput extends LightShellInput {
  method: string;
}

/**
 * Whether a request gets the static landing page: exactly the anonymous browser
 * visit to `/` that the light shell already selects (no session cookie, not
 * singleplayer, not the wiki host, not an app or client shell), on a page read.
 * Everything else, including every signed-in visit, reaches the app page.
 */
export function shouldServeStaticLanding(input: StaticLandingInput): boolean {
  const method = input.method.toUpperCase();
  return (
    input.pathname === "/" && (method === "GET" || method === "HEAD") && shouldUseLightShell(input)
  );
}
