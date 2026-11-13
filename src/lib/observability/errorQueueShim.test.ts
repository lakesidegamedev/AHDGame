import { describe, expect, it, vi } from "vitest";
import {
  ERROR_QUEUE_LIMIT,
  SENTRY_LOAD_FALLBACK_MS,
  installErrorShim,
  scheduleSentryLoad,
} from "./errorQueueShim";

function fakeWindow() {
  const handlers = new Map<string, Array<(event: Event) => void>>();
  return {
    addEventListener: (name: string, fn: (event: Event) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
    },
    removeEventListener: (name: string, fn: (event: Event) => void) => {
      handlers.set(
        name,
        (handlers.get(name) ?? []).filter((h) => h !== fn)
      );
    },
    fire(name: string, event: object = {}) {
      for (const fn of handlers.get(name) ?? []) fn(event as Event);
    },
    count: (name: string) => (handlers.get(name) ?? []).length,
  };
}

describe("installErrorShim", () => {
  it("queues errors and rejections in order and asks for the SDK", () => {
    const win = fakeWindow();
    const load = vi.fn();
    const shim = installErrorShim(win as never, load);
    const boom = new Error("boom");
    win.fire("error", { error: boom, message: "boom" });
    win.fire("unhandledrejection", { reason: "nope" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(shim.drain()).toEqual([
      { kind: "error", reason: boom },
      { kind: "unhandledrejection", reason: "nope" },
    ]);
    expect(shim.drain()).toEqual([]);
  });

  it("falls back to the message when the error object is missing", () => {
    const win = fakeWindow();
    const shim = installErrorShim(win as never, () => undefined);
    win.fire("error", { message: "Script error." });
    expect(shim.drain()).toEqual([{ kind: "error", reason: "Script error." }]);
  });

  it("caps the buffer", () => {
    const win = fakeWindow();
    const shim = installErrorShim(win as never, () => undefined);
    for (let i = 0; i < ERROR_QUEUE_LIMIT + 5; i++) win.fire("error", { error: new Error(`${i}`) });
    expect(shim.drain()).toHaveLength(ERROR_QUEUE_LIMIT);
  });

  it("stops listening after uninstall but keeps what it held", () => {
    const win = fakeWindow();
    const shim = installErrorShim(win as never, () => undefined);
    win.fire("error", { error: new Error("early") });
    shim.uninstall();
    expect(win.count("error")).toBe(0);
    expect(win.count("unhandledrejection")).toBe(0);
    expect(shim.drain()).toHaveLength(1);
  });
});

describe("scheduleSentryLoad", () => {
  function setup(visibility = "visible") {
    const win = fakeWindow();
    const doc = { ...fakeWindow(), visibilityState: visibility };
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const env = {
      addEventListener: win.addEventListener,
      removeEventListener: win.removeEventListener,
      setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
      clearTimeout: () => undefined,
    };
    return { win, doc, timers, env };
  }

  it("loads once on first interaction", () => {
    const { win, doc, env } = setup();
    const load = vi.fn();
    scheduleSentryLoad(env as never, doc as never, load);
    expect(load).not.toHaveBeenCalled();
    win.fire("pointerdown");
    win.fire("keydown");
    expect(load).toHaveBeenCalledTimes(1);
    expect(win.count("scroll")).toBe(0);
  });

  it("loads after the fallback while the tab is visible", () => {
    const { timers, doc, env } = setup();
    const load = vi.fn();
    scheduleSentryLoad(env as never, doc as never, load);
    expect(timers[0].ms).toBe(SENTRY_LOAD_FALLBACK_MS);
    timers[0].fn();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("waits for the tab to become visible after the fallback", () => {
    const { timers, doc, env } = setup("hidden");
    const load = vi.fn();
    scheduleSentryLoad(env as never, doc as never, load);
    timers[0].fn();
    expect(load).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.fire("visibilitychange");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled", () => {
    const { win, doc, env } = setup();
    const load = vi.fn();
    const cancel = scheduleSentryLoad(env as never, doc as never, load);
    cancel();
    win.fire("pointerdown");
    expect(load).not.toHaveBeenCalled();
  });
});
