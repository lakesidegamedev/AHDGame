import { describe, expect, it, vi } from "vitest";
import { gameConfigCollection } from "./gameConfig";
import type { CollectionSource } from "./source";

describe("gameConfig repository", () => {
  it("opens gameConfig on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = gameConfigCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("gameConfig");
    expect(handle).toEqual({ name: "gameConfig" });
  });
});
