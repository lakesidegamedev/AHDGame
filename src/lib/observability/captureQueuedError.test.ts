import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { captureQueuedError } from "./initSentryClient";

beforeEach(() => vi.clearAllMocks());

describe("captureQueuedError", () => {
  it("replays an Error as an unhandled exception", () => {
    const error = new Error("early");
    captureQueuedError({ kind: "error", reason: error });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: "auto.browser.queued.error", handled: false },
    });
  });

  it("replays a non-Error reason as a message", () => {
    captureQueuedError({ kind: "unhandledrejection", reason: "denied" });
    expect(sentry.captureMessage).toHaveBeenCalledWith("denied", "error");
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
