import { describe, expect, it, vi } from "vitest";
import { singleplayerRuntimeCollection } from "./singleplayerRuntime";
import type { CollectionSource } from "./source";

describe("singleplayerRuntime repository", () => {
  it("opens singleplayerRuntime on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = singleplayerRuntimeCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("singleplayerRuntime");
    expect(handle).toEqual({ name: "singleplayerRuntime" });
  });
});
