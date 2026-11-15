import { describe, expect, it, vi } from "vitest";
import { nationalArsenalCollection } from "./nationalArsenal";
import type { CollectionSource } from "./source";

describe("nationalArsenal repository", () => {
  it("opens nationalArsenal on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalArsenalCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalArsenal");
    expect(handle).toEqual({ name: "nationalArsenal" });
  });
});
