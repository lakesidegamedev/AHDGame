import { installErrorShim, scheduleSentryLoad, type ErrorShim } from "./errorQueueShim";

type SentryClient = typeof import("@sentry/nextjs");
type BrowserSdk = typeof import("./initSentryClient");
type NavigationArgs = Parameters<SentryClient["captureRouterTransitionStart"]>;

let loadPromise: Promise<BrowserSdk> | undefined;
let captureTransition: SentryClient["captureRouterTransitionStart"] | undefined;
let pendingNavigation: NavigationArgs | undefined;
let errorShim: ErrorShim | undefined;
let cancelScheduledLoad: (() => void) | undefined;

function loadSentryClient(): Promise<BrowserSdk> {
  if (!loadPromise) {
    cancelScheduledLoad?.();
    loadPromise = import("./initSentryClient")
      .then((sdk) => {
        captureTransition = sdk.initSentryClient();
        errorShim?.uninstall();
        for (const entry of errorShim?.drain() ?? []) sdk.captureQueuedError(entry);
        errorShim = undefined;
        if (pendingNavigation) captureTransition(...pendingNavigation);
        pendingNavigation = undefined;
        return sdk;
      })
      .catch((error: unknown) => {
        errorShim?.uninstall();
        errorShim = undefined;
        pendingNavigation = undefined;
        throw error;
      });
  }
  return loadPromise;
}

function startSentryClient(): void {
  void loadSentryClient().catch(() => {});
}

/** Keep early errors while the browser paints and hydrates the page. */
export function deferSentryClient(browser: Window, document: Document): void {
  if (loadPromise || errorShim) return;
  errorShim = installErrorShim(browser, startSentryClient);
  cancelScheduledLoad = scheduleSentryLoad(browser, document, startSentryClient);
}

export function captureClientNavigation(...args: NavigationArgs): void {
  if (captureTransition) {
    captureTransition(...args);
  } else {
    pendingNavigation = args;
    startSentryClient();
  }
}

/** Fire-and-forget exception capture after the SDK chunk loads. */
export function captureClientException(
  exception: unknown,
  captureContext?: Parameters<SentryClient["captureException"]>[1]
): void {
  void loadSentryClient()
    .then((Sentry) => {
      Sentry.captureException(exception, captureContext);
    })
    .catch(() => {
      // SDK chunk failed to load (offline / blocked) — nothing else to do.
    });
}

/** Fire-and-forget breadcrumb after the SDK chunk loads. */
export function addClientBreadcrumb(
  breadcrumb: Parameters<SentryClient["addBreadcrumb"]>[0]
): void {
  void loadSentryClient()
    .then((Sentry) => {
      Sentry.addBreadcrumb(breadcrumb);
    })
    .catch(() => {
      // ignore
    });
}

/**
 * Capture and resolve with the Sentry event id, so an error screen can show it
 * as the ref a player quotes in a report. Resolves undefined if the SDK is
 * unavailable (offline / blocked) or no id was issued.
 */
export function captureClientExceptionWithId(
  exception: unknown,
  captureContext?: Parameters<SentryClient["captureException"]>[1]
): Promise<string | undefined> {
  return loadSentryClient()
    .then((Sentry) => Sentry.captureException(exception, captureContext) || undefined)
    .catch(() => undefined);
}
