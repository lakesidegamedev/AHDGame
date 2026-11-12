"use client";

import { postHogConfigFor, resolvePostHogMode, type PostHogMode } from "./posthogMode";
import { getAnalyticsAccount, isAnalyticsGenerationCurrent } from "./accountContext";
import { getStoredConsent } from "@/components/CookieConsent";
import { ACCOUNT_CREATED_KEY, FIRST_MEANINGFUL_ACTION_KEY, FIRST_TURN_KEY } from "./storageKeys";

type PostHogClient = typeof import("posthog-js").default;

let clientPromise: Promise<PostHogClient | null> | null = null;
let identifiedAccountId: string | null = null;
/**
 * PostHog transport layer.
 *
 * This module knows about PostHog and nothing else. Product events belong in
 * `captureProductEvent` from `./capture`.
 * The funnel helpers and their storage anchors also live in `./capture`; this
 * module only clears those anchors when consent is withdrawn.
 */

const IDLE_TIMEOUT_MS = 3_000;
let activeMode: PostHogMode | null = null;

/** Never initialise during hydration or first paint. */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(resolve, 1_500);
    }
  });
}

function attachSurveyDismissalMirror(posthog: PostHogClient): void {
  // The hosted PostHog widget owns the close button. Mirror only its
  // dismissal position through the shared wrapper, without survey answers.
  posthog.on(
    "eventCaptured",
    (captured: { event?: string; properties?: Record<string, unknown> }) => {
      if (captured.event !== "survey dismissed") return;
      const questions = captured.properties?.$survey_questions;
      const questionIndex = Array.isArray(questions)
        ? questions.filter(
            (question: { response?: unknown }) =>
              question?.response !== undefined && question.response !== null
          ).length
        : 0;
      const { generation } = getAnalyticsAccount();
      void import("./capture").then(({ captureProductEvent }) => {
        if (isAnalyticsGenerationCurrent(generation)) {
          return captureProductEvent("survey_dismissed", { question_index: questionIndex });
        }
      });
    }
  );
}

function loadPostHog(key: string, mode: PostHogMode): Promise<PostHogClient | null> {
  activeMode = mode;
  clientPromise = whenIdle()
    .then(() => import("posthog-js"))
    .then(({ default: posthog }) => {
      if (mode === "full" && getStoredConsent() !== "accepted") return null;
      posthog.init(key, postHogConfigFor(mode));
      if (mode === "anonymous") return posthog;
      posthog.opt_in_capturing();
      attachSurveyDismissalMirror(posthog);
      return posthog;
    })
    .catch(() => null);
  void clientPromise.then((client) => {
    if (!client) {
      clientPromise = null;
      activeMode = null;
    }
  });
  return clientPromise;
}

/**
 * Starts anonymous page counting for a visitor who has not accepted analytics.
 * Nothing is stored on the device. A visitor who accepts later in the visit gets
 * full tracking on the next page load, because the mode is fixed at init.
 */
export function startAnonymousPageviews(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || clientPromise) return;
  if (resolvePostHogMode(getStoredConsent()) !== "anonymous") return;
  void loadPostHog(key, "anonymous");
}

/** Full product tracking loads only for a visitor who has accepted analytics. */
export function getPostHogClient(): Promise<PostHogClient | null> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || getStoredConsent() !== "accepted") return Promise.resolve(null);
  if (clientPromise)
    return clientPromise.then((client) => {
      if (!client || activeMode !== "full") return null;
      if (getStoredConsent() === "accepted" && client.has_opted_out_capturing()) {
        client.opt_in_capturing();
      }
      return client;
    });
  return loadPostHog(key, "full");
}

/** Survey loading starts only after the SDK has the authenticated account ID. */
export function identifyPostHogUser(
  client: PostHogClient,
  userId: string,
  properties?: { signup_date?: string; nation?: string; party?: string }
): void {
  if (getStoredConsent() !== "accepted" || getAnalyticsAccount().account?.id !== userId) return;
  // Reset only when the stored identity belongs to someone else. Resetting the
  // same player on every page load wipes the SDK's seen-survey records.
  if (client.get_distinct_id() !== userId) {
    client.reset();
    // reset() clears stored consent, which turns capture off under
    // opt_out_capturing_by_default and would drop the $identify below.
    client.opt_in_capturing();
  }
  identifiedAccountId = userId;
  client.identify(userId, { is_player: true, ...properties });
  // The SDK reads the remote survey setting once, at init, and ignores it while
  // surveys are disabled. Force loading here or surveys never start whenever
  // that response beat identify.
  client.set_config({ disable_surveys: false, advanced_enable_surveys: true });
}

/** Keep later anonymous page views from loading surveys after logout. */
export function resetPostHogUser(client: PostHogClient): void {
  identifiedAccountId = null;
  client.set_config({ disable_surveys: true, advanced_enable_surveys: false });
  client.reset();
  client.opt_in_capturing();
}

/**
 * PostHog-specific capture. Product events should go through
 * `captureProductEvent` in `./capture`; call this directly only for a PostHog-only concern.
 */
export async function capturePostHogEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  const { account, generation } = getAnalyticsAccount();
  if (!account) return;
  const client = await getPostHogClient();
  if (!client || !isAnalyticsGenerationCurrent(generation) || getStoredConsent() !== "accepted")
    return;
  if (identifiedAccountId !== account.id) identifyPostHogUser(client, account.id);
  if (properties) client.capture(event, properties);
  else client.capture(event);
}

/** Called when consent is withdrawn; no further events or recordings are sent. */
export async function stopPostHogCapture(): Promise<void> {
  const { generation } = getAnalyticsAccount();
  identifiedAccountId = null;
  try {
    window.localStorage.removeItem(ACCOUNT_CREATED_KEY);
    window.localStorage.removeItem(FIRST_MEANINGFUL_ACTION_KEY);
    window.localStorage.removeItem(FIRST_TURN_KEY);
    window.localStorage.removeItem("ahd:pending-war-declaration");
    window.localStorage.removeItem("ahd:last-tracked-turn");
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("ahd:bill-passed:") || key?.startsWith("ahd:election-won:")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Analytics storage is optional.
  }
  const client = await clientPromise;
  if (!client || activeMode !== "full" || !isAnalyticsGenerationCurrent(generation)) return;
  client.set_config({ disable_surveys: true, advanced_enable_surveys: false });
  client.opt_out_capturing();
  client.reset();
}
