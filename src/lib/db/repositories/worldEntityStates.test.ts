import { describe, expect, it, vi } from "vitest";
import { worldEntityStatesCollection } from "./worldEntityStates";
import type { CollectionSource } from "./source";

describe("worldEntityStates repository", () => {
  it("opens worldEntityStates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = worldEntityStatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("worldEntityStates");
    expect(handle).toEqual({ name: "worldEntityStates" });
  });
});
