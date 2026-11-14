import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils/fingerprint", () => ({ generateFingerprintData: generate }));

function stubWindow() {
  const listeners = new Map<string, () => void>();
  const timers: Array<() => void> = [];
  vi.stubGlobal("window", {
    addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
    removeEventListener: (name: string) => void listeners.delete(name),
    setTimeout: (fn: () => void) => timers.push(fn),
    clearTimeout: () => undefined,
  });
  return { listeners, timers };
}

beforeEach(() => {
  vi.resetModules();
  generate.mockReset();
  generate.mockResolvedValue({ hash: "h", components: null });
});

describe("fingerprint capture scheduling", () => {
  it("does not capture until the visitor interacts", async () => {
    const { listeners } = stubWindow();
    const { scheduleFingerprintCapture } = await import("./fingerprintCapture");
    scheduleFingerprintCapture();
    await Promise.resolve();
    expect(generate).not.toHaveBeenCalled();
    listeners.get("focusin")!();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it("falls back to a long timer for visitors who do not interact", async () => {
    const { timers } = stubWindow();
    const { scheduleFingerprintCapture } = await import("./fingerprintCapture");
    scheduleFingerprintCapture();
    timers[0]();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it("a submit before any interaction still gets the fingerprint, once", async () => {
    stubWindow();
    const { scheduleFingerprintCapture, getFingerprintForSubmission } =
      await import("./fingerprintCapture");
    scheduleFingerprintCapture();
    const first = await getFingerprintForSubmission();
    const second = await getFingerprintForSubmission();
    expect(first.hash).toBe("h");
    expect(second).toBe(first);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
