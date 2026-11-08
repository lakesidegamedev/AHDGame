/**
 * Singleplayer mode.
 *
 * The same application running locally with exactly one account: same pages,
 * API routes, simulation. Nothing about the game changes; with no one to
 * authenticate against, the session is fixed rather than negotiated.
 *
 * This is a deliberate authentication bypass, safe only on a single-user
 * machine. `assertSingleplayerAllowed` throws on any host that looks like a
 * deployment, so a misconfigured server fails to boot instead of quietly
 * serving every request as the local player.
 *
 * The seam is the middleware (`src/proxy.ts`), which mints a normal signed
 * session cookie for the local player. Nothing downstream is special-cased:
 * a real session is read normally everywhere, unlike a bypass that would have
 * to be re-applied at every path. Must stay free of `mongodb` and Node-only
 * imports (Edge runtime).
 */

/**
 * The local player's user id. Fixed, so `verifyAuth` resolves a session
 * without a database round trip on every request. New-game setup writes the
 * user document under this id.
 *
 * 24 hex characters, as ObjectId requires. The leading bytes spell "PLAYER"
 * so the id is recognisable in a database dump.
 */
export const SINGLEPLAYER_USER_ID = "504c41594552" + "000000000001";

/**
 * Just the environment lookups these helpers perform. Narrower than
 * `NodeJS.ProcessEnv`, which this repo augments with required keys such as
 * NODE_ENV, so callers and tests can pass only the vars under test.
 */
export type SingleplayerEnv = Record<string, string | undefined>;

function flagIsSet(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/**
 * Signals that this process is a hosted deployment rather than a player's
 * machine. Any one of them is enough to refuse singleplayer.
 *
 * `NEXT_PUBLIC_BASE_URL` is included because the desktop build always points
 * at loopback: a public origin means this is serving somebody else.
 */
function deploymentSignals(env: SingleplayerEnv = process.env): string[] {
  const signals: string[] = [];
  if (env.RAILWAY_ENVIRONMENT_NAME) signals.push("RAILWAY_ENVIRONMENT_NAME");
  if (env.RAILWAY_SERVICE_NAME) signals.push("RAILWAY_SERVICE_NAME");
  if (env.RAILWAY_PROJECT_ID) signals.push("RAILWAY_PROJECT_ID");
  if (env.VERCEL_ENV) signals.push("VERCEL_ENV");
  if (env.KUBERNETES_SERVICE_HOST) signals.push("KUBERNETES_SERVICE_HOST");

  const baseUrl = env.NEXT_PUBLIC_BASE_URL?.trim();
  if (baseUrl && !isLoopbackOrigin(baseUrl)) signals.push("NEXT_PUBLIC_BASE_URL");

  const uri = (env.MONGODB_URI || env.MONGO_URL)?.trim();
  if (uri && !isLocalMongoUri(uri)) signals.push("MONGODB_URI");

  return signals;
}

/** True when an origin points at this machine and nowhere else. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * True when a Mongo URI addresses this machine. A singleplayer world that
 * can reach a shared cluster is not a singleplayer world, and would let the
 * fixed session read another environment's data.
 */
export function isLocalMongoUri(uri: string): boolean {
  if (uri.startsWith("mongodb+srv://")) return false;
  const hosts = uri
    .replace(/^mongodb:\/\//, "")
    .split("/")[0]
    .split("@")
    .pop();
  if (!hosts) return false;
  return hosts.split(",").every((hostPort) => {
    const host = hostPort.split(":")[0];
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  });
}

export class SingleplayerNotAllowedError extends Error {
  constructor(signals: string[]) {
    super(
      `SINGLEPLAYER is set but this process looks like a hosted deployment ` +
        `(${signals.join(", ")}). Singleplayer replaces authentication with a ` +
        `fixed local session and must never run on a shared server. Refusing to start.`
    );
    this.name = "SingleplayerNotAllowedError";
  }
}

/**
 * Throws when singleplayer is requested on anything that looks like a server.
 * Safe to call when singleplayer is not requested: it does nothing.
 */
export function assertSingleplayerAllowed(env: SingleplayerEnv = process.env): void {
  if (!flagIsSet(env.SINGLEPLAYER)) return;
  const signals = deploymentSignals(env);
  if (signals.length > 0) throw new SingleplayerNotAllowedError(signals);
}

/**
 * The single question the rest of the app asks. Throws rather than returning
 * false on a deployment, so the bypass can never degrade into "off" on a
 * machine that was one env var away from serving every request as one user.
 */
export function isSingleplayer(env: SingleplayerEnv = process.env): boolean {
  if (!flagIsSet(env.SINGLEPLAYER)) return false;
  assertSingleplayerAllowed(env);
  return true;
}

/** Whether the local player also gets the admin surfaces. Opt-in. */
export function singleplayerIsAdmin(env: SingleplayerEnv = process.env): boolean {
  return isSingleplayer(env) && flagIsSet(env.SINGLEPLAYER_ADMIN);
}

/**
 * The claim set for the local player's session, matching `userPayloadSchema`
 * in `@/lib/auth`. Signed by the middleware with the local `AUTH_SECRET`, so
 * downstream verification is the ordinary path and not a special case.
 */
export function singleplayerSessionClaims(env: SingleplayerEnv = process.env): {
  userId: string;
  email: string;
  username: string;
  role: string;
  isAdmin: boolean;
} {
  const isAdmin = singleplayerIsAdmin(env);
  return {
    userId: SINGLEPLAYER_USER_ID,
    email: "player@localhost",
    username: "player",
    role: isAdmin ? "admin" : "player",
    isAdmin,
  };
}
