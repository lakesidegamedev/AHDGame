/**
 * The anonymous page view as one small request, so posthog-js stays off the
 * critical path. Same event the SDK sends in `anonymousPostHogConfig` mode:
 * cookieless sentinel distinct id, no person profile, no storage, no cookies.
 * PostHog derives the visitor hash on its servers from the request.
 */

export const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
export const COOKIELESS_DISTINCT_ID = "$posthog_cookieless";

const LIB_VERSION = "1.438.22";
const CAMPAIGN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gad_source",
  "mc_cid",
  "fbclid",
] as const;

export interface PageSnapshot {
  href: string;
  referrer: string;
  userAgent: string;
  language: string;
  timezone: string;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
}

function referringDomain(referrer: string): string {
  if (!referrer) return "$direct";
  try {
    return new URL(referrer).host;
  } catch {
    return "$direct";
  }
}

export function buildAnonymousPageview(
  snapshot: PageSnapshot,
  apiKey: string,
  now: Date,
  insertId: string
) {
  const url = new URL(snapshot.href);
  const campaign: Record<string, string> = {};
  for (const name of CAMPAIGN_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) campaign[name] = value;
  }
  return {
    api_key: apiKey,
    event: "$pageview",
    distinct_id: COOKIELESS_DISTINCT_ID,
    timestamp: now.toISOString(),
    properties: {
      $current_url: snapshot.href,
      $host: url.host,
      $pathname: url.pathname,
      $referrer: snapshot.referrer || "$direct",
      $referring_domain: referringDomain(snapshot.referrer),
      $raw_user_agent: snapshot.userAgent.slice(0, 1000),
      $browser_language: snapshot.language,
      $timezone: snapshot.timezone,
      $screen_width: snapshot.screen.width,
      $screen_height: snapshot.screen.height,
      $viewport_width: snapshot.viewport.width,
      $viewport_height: snapshot.viewport.height,
      $lib: "web",
      $lib_version: LIB_VERSION,
      $process_person_profile: false,
      $cookieless_mode: true,
      $insert_id: insertId,
      ...campaign,
    },
  };
}

export function readPageSnapshot(): PageSnapshot {
  return {
    href: window.location.href,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: { width: window.screen.width, height: window.screen.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

/** Fire and forget. `text/plain` keeps the request free of a CORS preflight. */
export function sendAnonymousPageview(apiKey: string): string | null {
  try {
    const snapshot = readPageSnapshot();
    const insertId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const body = JSON.stringify(buildAnonymousPageview(snapshot, apiKey, new Date(), insertId));
    const sent = navigator.sendBeacon?.(
      POSTHOG_CAPTURE_URL,
      new Blob([body], { type: "text/plain" })
    );
    if (!sent) {
      void fetch(POSTHOG_CAPTURE_URL, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
        credentials: "omit",
      }).catch(() => undefined);
    }
    return snapshot.href;
  } catch {
    return null;
  }
}
