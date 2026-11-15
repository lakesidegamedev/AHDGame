import { describe, expect, it, vi } from "vitest";
import { charactersCollection } from "./characters";
import type { CollectionSource } from "./source";

describe("characters repository", () => {
  it("opens characters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = charactersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("characters");
    expect(handle).toEqual({ name: "characters" });
  });
});
