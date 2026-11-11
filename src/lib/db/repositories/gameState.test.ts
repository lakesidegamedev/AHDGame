import { describe, expect, it, vi } from "vitest";
import { gameStateCollection } from "./gameState";
import type { CollectionSource } from "./source";

describe("gameState repository", () => {
  it("opens gameState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = gameStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("gameState");
    expect(handle).toEqual({ name: "gameState" });
  });
});
