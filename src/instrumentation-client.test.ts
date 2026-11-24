import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureQueuedError: vi.fn(),
  captureTransition: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/clientShell/tauriAclFallback", () => ({
  installTauriAclFallback: vi.fn(),
}));
vi.mock("@/lib/observability/initSentryClient", () => ({
  initSentryClient: sentry.init,
  captureQueuedError: sentry.captureQueuedError,
  captureException: sentry.captureException,
}));

describe("browser instrumentation on gameplay pages", () => {
  let browser: EventTarget;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    sentry.init.mockReturnValue(sentry.captureTransition);
    browser = Object.assign(new EventTarget(), {
      location: { pathname: "/profile" },
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("leaves the SDK out of the initial load and starts it on interaction", async () => {
    await import("./instrumentation-client");
    await vi.dynamicImportSettled();
    expect(sentry.init).not.toHaveBeenCalled();

    browser.dispatchEvent(new Event("pointerdown"));
    await vi.dynamicImportSettled();
    expect(sentry.init).toHaveBeenCalledOnce();
  });

  it("starts immediately and reports an uncaught error before interaction", async () => {
    await import("./instrumentation-client");
    const error = new Error("initial render failed");
    browser.dispatchEvent(Object.assign(new Event("error"), { error }));
    await vi.dynamicImportSettled();
    expect(sentry.init).toHaveBeenCalledOnce();
    expect(sentry.captureQueuedError).toHaveBeenCalledWith({ kind: "error", reason: error });
  });

  it("passes the first client navigation through as soon as the SDK is ready", async () => {
    const { onRouterTransitionStart } = await import("./instrumentation-client");
    onRouterTransitionStart("/market", "push");
    await vi.dynamicImportSettled();
    expect(sentry.captureTransition).toHaveBeenCalledWith("/market", "push");

    onRouterTransitionStart("/portfolio", "replace");
    expect(sentry.captureTransition).toHaveBeenCalledTimes(2);
    expect(sentry.captureTransition).toHaveBeenLastCalledWith("/portfolio", "replace");
  });

  it("initializes before sending an explicitly reported startup error", async () => {
    await import("./instrumentation-client");
    const { captureClientExceptionWithId } = await import("@/lib/observability/sentryClientLazy");
    const error = new Error("request failed");
    sentry.captureException.mockReturnValueOnce("report-id");
    await expect(captureClientExceptionWithId(error)).resolves.toBe("report-id");
    expect(sentry.captureException).toHaveBeenCalledWith(error, undefined);
    expect(sentry.init).toHaveBeenCalledBefore(sentry.captureException);

    browser.dispatchEvent(new Event("pointerdown"));
    expect(sentry.init).toHaveBeenCalledOnce();
  });
});
