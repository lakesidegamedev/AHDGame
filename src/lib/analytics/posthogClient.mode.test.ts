import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consent: null as "accepted" | "rejected" | null,
  init: vi.fn(),
  optIn: vi.fn(),
}));

vi.mock("@/components/CookieConsent", () => ({ getStoredConsent: () => state.consent }));
vi.mock("posthog-js", () => ({
  default: {
    init: state.init,
    opt_in_capturing: state.optIn,
    has_opted_out_capturing: () => false,
    on: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubGlobal("window", {});
  state.consent = null;
});

async function flush() {
  await vi.advanceTimersByTimeAsync(2_000);
}

describe("posthog client modes", () => {
  it("initialises anonymously without consent, only after idle", async () => {
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    expect(state.init).not.toHaveBeenCalled();
    await flush();
    expect(state.init).toHaveBeenCalledTimes(1);
    expect(state.init.mock.calls[0][1]).toMatchObject({
      cookieless_mode: "always",
      person_profiles: "never",
      capture_pageview: "history_change",
      disable_session_recording: true,
    });
    expect(state.optIn).not.toHaveBeenCalled();
  });

  it("initialises anonymously after a rejection", async () => {
    state.consent = "rejected";
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await flush();
    expect(state.init.mock.calls[0][1]).toMatchObject({ cookieless_mode: "always" });
  });

  it("initialises the full setup for an accepted visitor", async () => {
    state.consent = "accepted";
    const { getPostHogClient, startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    const pending = getPostHogClient();
    await flush();
    await pending;
    expect(state.init).toHaveBeenCalledTimes(1);
    const config = state.init.mock.calls[0][1];
    expect(config).toMatchObject({
      capture_pageview: "history_change",
      persistence: "localStorage+cookie",
    });
    expect(config.cookieless_mode).toBeUndefined();
    expect(state.optIn).toHaveBeenCalled();
  });

  it("does not switch to full tracking when a visitor accepts mid-visit", async () => {
    const { getPostHogClient, startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await flush();
    state.consent = "accepted";
    const client = await getPostHogClient();
    expect(client).toBeNull();
    expect(state.init).toHaveBeenCalledTimes(1);
    expect(state.init.mock.calls[0][1]).toMatchObject({ cookieless_mode: "always" });
  });

  it("does nothing without a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await flush();
    expect(state.init).not.toHaveBeenCalled();
  });
});
