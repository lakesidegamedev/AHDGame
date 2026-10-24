/**
 * Save a Playwright storage state by logging in through the API.
 *
 * The performance checks need a signed-in player: `/profile`, `/actions` and
 * `/portfolio` are per-character pages, and the anonymous measurement only ever
 * sees their redirects. This logs in against a local benchmark world and writes
 * the cookie jar in Playwright's storageState format.
 *
 * Usage:
 *   node scripts/perf/page-load/login-state.mjs \
 *     --base=http://127.0.0.1:3100 \
 *     --user=perfbench --password=... \
 *     --out=/tmp/ahd-storage.json
 *
 * The account is expected to exist in the benchmark database only. Never point
 * this at production with a real player's credentials.
 */
import { writeFile } from "node:fs/promises";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const user = arg("user", "perfbench");
const password = arg("password", "perf-bench-2026");
const out = arg("out", "/tmp/ahd-storage.json");

const response = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 Playwright" },
  body: JSON.stringify({ email: user, password }),
});

if (!response.ok) {
  console.error(`login failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const setCookies = response.headers.getSetCookie?.() ?? [];
const nowSeconds = Math.floor(Date.now() / 1000);
const host = new URL(base).hostname;
const cookies = [];

for (const raw of setCookies) {
  const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  if (eq <= 0) continue;
  const cookie = {
    name: pair.slice(0, eq),
    value: pair.slice(eq + 1),
    domain: host,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
  for (const attribute of attributes) {
    const [keyRaw, valueRaw = ""] = attribute.split("=");
    const key = keyRaw.toLowerCase();
    if (key === "path") cookie.path = valueRaw || "/";
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
    if (key === "samesite") {
      cookie.sameSite = valueRaw.toLowerCase() === "none"
        ? "None"
        : valueRaw.toLowerCase() === "strict"
          ? "Strict"
          : "Lax";
    }
    if (key === "max-age") {
      const seconds = Number(valueRaw);
      if (Number.isFinite(seconds)) cookie.expires = nowSeconds + seconds;
    }
    if (key === "expires") {
      const parsed = Date.parse(valueRaw);
      if (Number.isFinite(parsed)) cookie.expires = Math.floor(parsed / 1000);
    }
  }
  cookies.push(cookie);
}

await writeFile(
  out,
  JSON.stringify(
    { cookies, origins: [{ origin: base, localStorage: [] }] },
    null,
    2
  )
);

console.log(`logged in as ${user}; ${cookies.length} cookies written to ${out}`);
