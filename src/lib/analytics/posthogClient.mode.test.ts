import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consent: null as "accepted" | "rejected" | null,
  init: vi.fn(),
  optIn: vi.fn(),
  beacon: vi.fn(() => true),
  listeners: new Map<string, () => void>(),
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
  const listeners = new Map<string, () => void>();
  vi.stubGlobal("window", {
    addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
    removeEventListener: (name: string) => void listeners.delete(name),
    location: { href: "https://ahousedividedgame.com/" },
    screen: { width: 390, height: 844 },
    innerWidth: 390,
    innerHeight: 700,
  });
  vi.stubGlobal("document", { referrer: "" });
  vi.stubGlobal("navigator", { userAgent: "test", language: "en", sendBeacon: state.beacon });
  state.listeners = listeners;
  state.consent = null;
});

async function flush() {
  await vi.advanceTimersByTimeAsync(2_000);
}

async function interact() {
  state.listeners.get("pointerdown")?.();
  await flush();
}

describe("posthog client modes", () => {
  it("sends one beacon and does not load the SDK until the visitor interacts", async () => {
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await flush();
    expect(state.beacon).toHaveBeenCalledTimes(1);
    expect(state.init).not.toHaveBeenCalled();
    await interact();
    expect(state.init).toHaveBeenCalledTimes(1);
    expect(state.init.mock.calls[0][1]).toMatchObject({
      cookieless_mode: "always",
      person_profiles: "never",
      capture_pageview: "history_change",
      disable_session_recording: true,
    });
    expect(state.optIn).not.toHaveBeenCalled();
  });

  it("drops the SDK's duplicate of the beaconed initial page view", async () => {
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await interact();
    const beforeSend = state.init.mock.calls[0][1].before_send;
    const initial = {
      event: "$pageview",
      properties: { $current_url: "https://ahousedividedgame.com/" },
    };
    expect(beforeSend(initial)).toBeNull();
    expect(beforeSend(initial)).toBe(initial);
    const later = {
      event: "$pageview",
      properties: { $current_url: "https://ahousedividedgame.com/login" },
    };
    expect(beforeSend(later)).toBe(later);
  });

  it("counts a rejection anonymously", async () => {
    state.consent = "rejected";
    const { startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    await interact();
    expect(state.beacon).toHaveBeenCalledTimes(1);
    expect(state.init.mock.calls[0][1]).toMatchObject({ cookieless_mode: "always" });
  });

  it("initialises the full setup for an accepted visitor, with no beacon", async () => {
    state.consent = "accepted";
    const { getPostHogClient, startAnonymousPageviews } = await import("./posthogClient");
    startAnonymousPageviews();
    const pending = getPostHogClient();
    await flush();
    await pending;
    expect(state.beacon).not.toHaveBeenCalled();
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
    await interact();
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
    await interact();
    expect(state.beacon).not.toHaveBeenCalled();
    expect(state.init).not.toHaveBeenCalled();
  });
});
