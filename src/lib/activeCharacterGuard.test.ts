import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveCharacterMismatch,
  noteCharacterSwitchSignal,
  noteRenderedCharacter,
  noteServerCharacter,
  resetActiveCharacterGuardForTests,
  subscribeActiveCharacterMismatch,
} from "./activeCharacterGuard";

describe("activeCharacterGuard", () => {
  beforeEach(() => resetActiveCharacterGuardForTests());

  it("ignores server answers before the page character is known", () => {
    noteServerCharacter("b", "Other");
    expect(getActiveCharacterMismatch()).toBeNull();
  });

  it("flags a different active character reported by the server", () => {
    noteRenderedCharacter("a");
    const fn = vi.fn();
    subscribeActiveCharacterMismatch(fn);
    noteServerCharacter("b", "Other");
    expect(getActiveCharacterMismatch()).toEqual({ characterId: "b", name: "Other" });
    expect(fn).toHaveBeenCalledTimes(1);
    noteServerCharacter("b", "Other");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps the first rendered character and clears when the server agrees again", () => {
    noteRenderedCharacter("a");
    noteRenderedCharacter("b");
    noteServerCharacter("b", null);
    expect(getActiveCharacterMismatch()?.characterId).toBe("b");
    noteServerCharacter("a", null);
    expect(getActiveCharacterMismatch()).toBeNull();
  });

  it("accepts a same-browser switch signal for another character only", () => {
    noteRenderedCharacter("a");
    noteCharacterSwitchSignal({ characterId: "a", name: null });
    expect(getActiveCharacterMismatch()).toBeNull();
    noteCharacterSwitchSignal({ characterId: "c", name: "Third" });
    expect(getActiveCharacterMismatch()?.name).toBe("Third");
  });
});
