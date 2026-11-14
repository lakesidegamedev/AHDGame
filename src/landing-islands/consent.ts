/**
 * Cookie choice and the anonymous counts for the static landing page. It writes
 * the same storage key and values as the app's CookieConsent, so a choice made
 * here is the one every other page reads.
 */
import { COOKIE_CONSENT_KEY } from "../lib/analytics/storageKeys";
import { sendAnonymousPageview } from "../lib/analytics/anonymousPageviewBeacon";
import { sendIntakeBeacon, sendIntakeBeaconOnce } from "../lib/analytics/intakeBeacon";
import { classifyLandingCta } from "../lib/analytics/landingCta";

type Consent = "accepted" | "rejected";

function stored(): Consent | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

function choose(choice: Consent) {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    // Storage unavailable; the banner still closes for this visit.
  }
  document.documentElement.dataset.cookieConsent = choice;
}

function reopen() {
  try {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
  } catch {
    // Nothing stored to clear.
  }
  delete document.documentElement.dataset.cookieConsent;
}

const current = stored();
if (current) document.documentElement.dataset.cookieConsent = current;

document.addEventListener(
  "click",
  (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement>("[data-consent]");
    if (button) return choose(button.dataset.consent === "accepted" ? "accepted" : "rejected");
    if (target?.closest("[data-cookie-settings]")) return reopen();
    const cta = classifyLandingCta(target?.closest("a")?.getAttribute("href") ?? null);
    if (cta) sendIntakeBeacon("landing_cta_clicked", { surface: "landing", cta });
  },
  true
);

const config = JSON.parse(document.getElementById("landing-config")?.textContent ?? "{}") as {
  posthogKey?: string;
  gameVersion?: string;
};

function afterIdle(run: () => void, timeout: number) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout });
  else setTimeout(run, 1500);
}

afterIdle(() => {
  sendIntakeBeaconOnce("landing_viewed", "landing_viewed", { surface: "landing" });
  // Full tracking needs the app; a visitor who accepted gets it on the next page.
  if (config.posthogKey && stored() !== "accepted") sendAnonymousPageview(config.posthogKey);
  const nav = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  const end = nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0) : 0;
  const body = JSON.stringify({
    path: "/",
    gameVersion: config.gameVersion,
    ...(end > 0 && end < 120_000 ? { loadTimeMs: end } : {}),
  });
  try {
    navigator.sendBeacon("/api/analytics/pageview", new Blob([body], { type: "application/json" }));
  } catch {
    // Best effort.
  }
}, 3000);
