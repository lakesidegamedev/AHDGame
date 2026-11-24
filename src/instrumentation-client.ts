import { installTauriAclFallback } from "@/lib/clientShell/tauriAclFallback";
import { captureClientNavigation, deferSentryClient } from "@/lib/observability/sentryClientLazy";

if (typeof window !== "undefined") {
  // Inside the AHDClient shell, reopen new-tab links the shell refuses to open
  // itself and mark those refusals handled. No-op in a normal browser.
  installTauriAclFallback(window);
  deferSentryClient(window, document);
}

export const onRouterTransitionStart = captureClientNavigation;
