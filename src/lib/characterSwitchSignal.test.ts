// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceCharacterSwitch, subscribeToCharacterSwitch } from "./characterSwitchSignal";

describe("characterSwitchSignal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delivers a switch announced by another context through BroadcastChannel", () => {
    const channels: Array<{ onmessage: ((e: MessageEvent) => void) | null }> = [];
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        channels.push(this);
      }
      postMessage(data: unknown) {
        channels.filter((c) => c !== this).forEach((c) => c.onmessage?.({ data } as MessageEvent));
      }
      close() {
        const i = channels.indexOf(this);
        if (i >= 0) channels.splice(i, 1);
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const seen = vi.fn();
    const stop = subscribeToCharacterSwitch(seen);
    announceCharacterSwitch({ characterId: "c2", name: "Second" });
    expect(seen).toHaveBeenCalledWith({ characterId: "c2", name: "Second" });
    stop();
  });

  it("falls back to the storage event when BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const seen = vi.fn();
    const stop = subscribeToCharacterSwitch(seen);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ahd-active-character-switch",
        newValue: JSON.stringify({ characterId: "c3", name: null }),
      })
    );
    expect(seen).toHaveBeenCalledWith({ characterId: "c3", name: null });
    stop();
  });
});
