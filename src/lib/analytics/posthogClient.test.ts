import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consent: null as "accepted" | "rejected" | null,
  optedOut: true,
  distinctId: "anonymous",
  init: vi.fn(),
  capture: vi.fn(),
  optIn: vi.fn(),
  optOut: vi.fn(),
  reset: vi.fn(),
  identify: vi.fn(),
  setConfig: vi.fn(),
}));

vi.mock("@/components/CookieConsent", () => ({
  getStoredConsent: () => state.consent,
}));
vi.mock("posthog-js", () => ({
  default: {
    init: state.init,
    capture: state.capture,
    opt_in_capturing: state.optIn.mockImplementation(() => {
      state.optedOut = false;
    }),
    opt_out_capturing: state.optOut.mockImplementation(() => {
      state.optedOut = true;
    }),
    has_opted_out_capturing: () => state.optedOut,
    reset: state.reset.mockImplementation(() => {
      state.distinctId = "anonymous";
    }),
    identify: state.identify.mockImplementation((id: string) => {
      state.distinctId = id;
    }),
    get_distinct_id: () => state.distinctId,
    set_config: state.setConfig,
    on: vi.fn(),
  },
}));

describe("PostHog consent boundary", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    state.consent = null;
    state.optedOut = true;
    state.distinctId = "anonymous";
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    const { setAnalyticsAccount } = await import("./accountContext");
    setAnalyticsAccount({ id: "stable-user-id" });
    const { setProductEventContext } = await import("./capture");
    setProductEventContext({ iteration_id: "alpha-1", turn_number: 8, nation_id: "US" });
  });

  it("does not initialize or capture before consent", async () => {
    const { captureProductEvent } = await import("./capture");
    await captureProductEvent("account_created");
    expect(state.init).not.toHaveBeenCalled();
    expect(state.capture).not.toHaveBeenCalled();
  });

  it("keeps surveys disabled before an authenticated user is identified", async () => {
    const { getPostHogClient } = await import("./posthogClient");
    state.consent = "accepted";
    await getPostHogClient();
    expect(state.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        disable_surveys: true,
      })
    );
    expect(state.setConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ disable_surveys: false })
    );
  });

  it("enables surveys only after identifying the stable user ID", async () => {
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    const client = await getPostHogClient();
    expect(client).not.toBeNull();
    identifyPostHogUser(client!, "stable-user-id");
    expect(state.identify).toHaveBeenCalledWith("stable-user-id", { is_player: true });
    // Forced on: the init-time remote config was ignored while surveys were off.
    expect(state.setConfig).toHaveBeenCalledWith({
      disable_surveys: false,
      advanced_enable_surveys: true,
    });
    expect(state.identify.mock.invocationCallOrder[0]).toBeLessThan(
      state.setConfig.mock.invocationCallOrder[0]
    );
  });

  it("keeps the same player's survey history across page loads", async () => {
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    state.distinctId = "stable-user-id";
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    expect(state.reset).not.toHaveBeenCalled();
    expect(state.identify).toHaveBeenCalledWith("stable-user-id", { is_player: true });
  });

  it("resets a different stored identity and re-opts in before identifying", async () => {
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    const client = (await getPostHogClient())!;
    state.distinctId = "previous-user-id";
    state.reset.mockImplementationOnce(() => {
      state.distinctId = "anonymous";
      state.optedOut = true;
    });
    identifyPostHogUser(client, "stable-user-id");
    expect(state.reset).toHaveBeenCalledTimes(1);
    expect(state.optedOut).toBe(false);
    const optInAfterReset = state.optIn.mock.invocationCallOrder.at(-1)!;
    expect(state.reset.mock.invocationCallOrder[0]).toBeLessThan(optInAfterReset);
    expect(optInAfterReset).toBeLessThan(state.identify.mock.invocationCallOrder[0]);
  });

  it("turns forced survey loading back off on logout", async () => {
    const { getPostHogClient, identifyPostHogUser, resetPostHogUser } =
      await import("./posthogClient");
    state.consent = "accepted";
    const client = (await getPostHogClient())!;
    identifyPostHogUser(client, "stable-user-id");
    resetPostHogUser(client);
    expect(state.setConfig).toHaveBeenLastCalledWith({
      disable_surveys: true,
      advanced_enable_surveys: false,
    });
  });

  it("drops unauthenticated events instead of attaching them to a later account", async () => {
    const { setAnalyticsAccount } = await import("./accountContext");
    const { captureProductEvent } = await import("./capture");
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    setAnalyticsAccount(null);
    await captureProductEvent("bill_drafted");
    setAnalyticsAccount({ id: "stable-user-id" });
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    expect(state.capture).not.toHaveBeenCalled();
  });

  it("enables sampled, masked session recording with sensitive screens blocked", async () => {
    const { getPostHogClient } = await import("./posthogClient");
    state.consent = "accepted";
    await getPostHogClient();
    expect(state.init).toHaveBeenCalledTimes(1);
    const config = state.init.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(config.disable_session_recording).toBeUndefined();
    expect(config.session_recording).toMatchObject({
      sampleRate: 0.1,
      maskAllInputs: true,
      recordHeaders: false,
      recordBody: false,
      blockSelector: "[data-replay-block]",
    });
  });

  it("stops capture after rejection and resumes only after another opt in", async () => {
    const { captureProductEvent } = await import("./capture");
    const { stopPostHogCapture, getPostHogClient, identifyPostHogUser } =
      await import("./posthogClient");
    state.consent = "accepted";
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    await captureProductEvent("account_created");
    expect(state.capture).toHaveBeenCalledTimes(1);

    state.consent = "rejected";
    await stopPostHogCapture();
    await captureProductEvent("character_created");
    expect(state.optOut).toHaveBeenCalledTimes(1);
    expect(state.capture).toHaveBeenCalledTimes(1);

    state.consent = "accepted";
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    await captureProductEvent("character_created");
    expect(state.optIn.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      state.optOut.mock.invocationCallOrder[0]
    );
    expect(state.capture).toHaveBeenCalledTimes(2);
  });

  it("records the first completed turn once for the newly created character", async () => {
    const { rememberNewCharacter, captureFirstTurnIfReady } = await import("./capture");
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    rememberNewCharacter("char1", 10);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ currentTurn: 11, isProcessing: true }),
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ currentTurn: 11, isProcessing: false }),
        })
    );

    await captureFirstTurnIfReady("char1");
    expect(state.capture).not.toHaveBeenCalled();
    await Promise.all([captureFirstTurnIfReady("char1"), captureFirstTurnIfReady("char1")]);
    await captureFirstTurnIfReady("char1");
    expect(state.capture).toHaveBeenCalledTimes(2);
    expect(state.capture).toHaveBeenCalledWith(
      "character_created",
      expect.objectContaining({ iteration_id: "alpha-1", turn_number: 8, nation_id: "US" })
    );
    expect(state.capture).toHaveBeenCalledWith(
      "first_turn_completed",
      expect.objectContaining({ iteration_id: "alpha-1", turn_number: 8, nation_id: "US" })
    );
  });

  it("carries successful signup across a full navigation and captures it once", async () => {
    const { rememberAccountCreated, capturePendingAccountCreated } = await import("./capture");
    const { getPostHogClient, identifyPostHogUser } = await import("./posthogClient");
    state.consent = "accepted";
    identifyPostHogUser((await getPostHogClient())!, "stable-user-id");
    rememberAccountCreated("stable-user-id");
    await Promise.all([capturePendingAccountCreated(), capturePendingAccountCreated()]);
    await capturePendingAccountCreated();
    expect(state.capture).toHaveBeenCalledTimes(1);
    expect(state.capture).toHaveBeenCalledWith(
      "account_created",
      expect.objectContaining({ iteration_id: "alpha-1", turn_number: 8, nation_id: "US" })
    );
  });

  it("discards pending milestones when consent is withdrawn", async () => {
    const {
      rememberAccountCreated,
      rememberNewCharacter,
      capturePendingAccountCreated,
      capturePendingCharacterCreated,
    } = await import("./capture");
    const { stopPostHogCapture } = await import("./posthogClient");
    state.consent = "accepted";
    rememberAccountCreated("stable-user-id");
    rememberNewCharacter("char1", 10);
    state.consent = "rejected";
    await stopPostHogCapture();
    state.consent = "accepted";
    await capturePendingAccountCreated();
    await capturePendingCharacterCreated("char1");
    expect(state.capture).not.toHaveBeenCalled();
  });
});

afterAll(() => vi.unstubAllEnvs());
