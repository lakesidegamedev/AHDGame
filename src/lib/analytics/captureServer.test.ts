import { afterEach, expect, it, vi } from "vitest";
import { captureServerProductEvent } from "./captureServer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("sends a recovered lock event to PostHog", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);

  await captureServerProductEvent(
    "turn_lock_stuck",
    { lock_age_ms: 1200000, phase: "economy" },
    { turn: 42 }
  );

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://us.i.posthog.com/i/v0/e/");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    event: "turn_lock_stuck",
    properties: {
      lock_age_ms: 1200000,
      phase: "economy",
      iteration_id: "unknown",
      turn_number: 42,
    },
  });
});

it("reports a rejected event", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  await captureServerProductEvent("turn_lock_stuck", { lock_age_ms: 1200000 });

  expect(warning).toHaveBeenCalledWith(
    expect.stringContaining("PostHog rejected turn_lock_stuck: 400")
  );
  warning.mockRestore();
});
