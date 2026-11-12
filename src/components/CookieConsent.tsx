"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

import { COOKIE_CONSENT_KEY } from "@/lib/analytics/storageKeys";

const STORAGE_KEY = COOKIE_CONSENT_KEY;
export const CONSENT_EVENT = "ahd:cookie-consent-changed";
export const CONSENT_RESET_EVENT = "ahd:cookie-consent-reset";

export type CookieConsentValue = "accepted" | "rejected";

export function getStoredConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function openCookiePreferences() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
  // Re-show the first-paint banner immediately: the gate attribute is what
  // hides it, and clearing it here avoids waiting for the effect below.
  delete document.documentElement.dataset.cookieConsent;
  window.dispatchEvent(new Event(CONSENT_RESET_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CONSENT_EVENT, callback);
  window.addEventListener(CONSENT_RESET_EVENT, callback);
  return () => {
    window.removeEventListener(CONSENT_EVENT, callback);
    window.removeEventListener(CONSENT_RESET_EVENT, callback);
  };
}

// Sentinel: the SSR snapshot must equal the first client snapshot to avoid a
// hydration mismatch. We treat "unset" as "decision not yet read" — different
// from a deliberate null/rejected — and skip rendering until the post-commit
// snapshot resolves to a real value or null.
const UNSET = Symbol("unset");
type ConsentSnapshot = CookieConsentValue | null | typeof UNSET;

function getSnapshot(): ConsentSnapshot {
  return getStoredConsent();
}

function getServerSnapshot(): ConsentSnapshot {
  return UNSET;
}

function setConsent(choice: CookieConsentValue) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // localStorage unavailable (private mode, quota) — still notify listeners
  }
  // Hide (or re-show) the banner before React re-renders: the first paint of a
  // returning player must never be gated on the post-hydration snapshot.
  document.documentElement.dataset.cookieConsent = choice;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

export function CookieConsentBanner() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (consent === UNSET) return;
    const root = document.documentElement;
    if (consent) {
      root.dataset.cookieConsent = consent;
    } else {
      delete root.dataset.cookieConsent;
    }
  }, [consent]);

  // The banner is part of the first paint, not a post-hydration mount. It used
  // to appear only after the client store resolved localStorage, which made a
  // fixed overlay the Largest Contentful Paint element on anonymous loads
  // (/world measured 3.9s of render delay). Rendering it server-side and
  // hiding it with `html[data-cookie-consent]` (set by the inline script in the
  // root layout) keeps consenting players from ever seeing it while giving a
  // first-time visitor the banner at FCP.
  return (
    <div data-cookie-consent-banner="true">
      <div aria-hidden="true" className="h-56 sm:hidden" />
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Cookie consent"
        className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[150] mx-auto max-h-[40vh] max-w-3xl overflow-y-auto rounded-xl border border-card-border bg-card shadow-modal sm:inset-x-4 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:max-h-none sm:overflow-visible"
      >
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="flex-1 text-xs leading-snug text-muted sm:text-sm sm:leading-relaxed">
            <p className="mb-0.5 font-semibold text-foreground sm:mb-1">We use cookies</p>
            <p>
              We use essential cookies to keep you signed in and the game running. With your
              permission, PostHog records how you use the game and we may record a sample of
              sessions to find confusing flows and technical problems. You can reject optional
              analytics or change your choice at any time. See our{" "}
              <Link href="/privacy" className="text-muted underline hover:text-foreground">
                Privacy policy
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              className="flex-1 sm:flex-none"
              onClick={() => setConsent("rejected")}
              aria-label="Reject non-essential cookies"
            >
              Reject
            </Button>
            <Button
              variant="primary"
              className="min-w-0 flex-1 px-4 sm:flex-none"
              onClick={() => setConsent("accepted")}
              aria-label="Accept all cookies"
            >
              Accept all
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
