// Client-side Sentry (App Router). Next resolves src/instrumentation-client before the root file.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// The browser SDK is intentionally NOT statically imported here. A static
// `@sentry/nextjs` import lands ~450KB in the shared rootMain shell for every
// page — including the anonymous marketing landing page. Instead we dynamic-
// import the init module:
//   - Marketing / auth-entry paths: a tiny error shim holds early errors and the
//     SDK loads on first interaction, first error, or a long fallback.
//   - All other (logged-in app) paths: start the dynamic import immediately so
//     hydration/render error coverage begins as soon as the async chunk loads.
// App routes keep eager load.

import { installTauriAclFallback } from "@/lib/clientShell/tauriAclFallback";
import {
  installErrorShim,
  scheduleSentryLoad,
  type ErrorShim,
} from "@/lib/observability/errorQueueShim";

type RouterTransitionStart = (...args: unknown[]) => void;

let captureRouterTransitionStartImpl: RouterTransitionStart = () => {};
let initStarted = false;

/**
 * Paths where we defer Sentry until after first paint / idle.
 * Keep this list to anonymous marketing + auth entry points only — anything
 * with a signed-in shell should init ASAP.
 */
function shouldDeferSentryInit(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  const deferred = [
    "/login",
    "/register",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/faq",
    "/changelog",
    "/guides",
    "/banned",
    "/maintenance",
    "/supporters",
    // OAuth callbacks are a landing page that immediately navigates away.
    // Booting the ~450KB SDK here competed with that navigation on the
    // sign-in path itself, which page-load telemetry ranks as the slowest
    // route in the game.
    "/auth",
  ];
  return deferred.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

let errorShim: ErrorShim | null = null;

function startSentryInit(): void {
  if (initStarted) return;
  initStarted = true;

  void import("@/lib/observability/initSentryClient")
    .then(({ initSentryClient, captureQueuedError }) => {
      captureRouterTransitionStartImpl = initSentryClient() as RouterTransitionStart;
      // The SDK now owns the global handlers; replay what the shim held back.
      errorShim?.uninstall();
      for (const entry of errorShim?.drain() ?? []) captureQueuedError(entry);
      errorShim = null;
    })
    .catch(() => {
      // SDK failed to load — leave transition capture as no-op.
    });
}

function bootSentry(): void {
  const pathname = window.location.pathname;

  if (!shouldDeferSentryInit(pathname)) {
    startSentryInit();
    return;
  }

  // Anonymous public pages: no SDK on the critical path. A tiny shim holds the
  // first errors, and the SDK loads on first interaction, on the first error, or
  // after a long fallback.
  errorShim = installErrorShim(window, startSentryInit);
  scheduleSentryLoad(
    {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
    },
    document,
    startSentryInit
  );
}

if (typeof window !== "undefined") {
  // Inside the AHDClient shell, reopen new-tab links the shell refuses to open
  // itself and mark those refusals handled. No-op in a normal browser.
  installTauriAclFallback(window);
  bootSentry();
}

export const onRouterTransitionStart: RouterTransitionStart = (...args) => {
  captureRouterTransitionStartImpl(...args);
};
