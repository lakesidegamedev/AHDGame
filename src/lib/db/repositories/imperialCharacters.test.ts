import { describe, expect, it, vi } from "vitest";
import { imperialCharactersCollection } from "./imperialCharacters";
import type { CollectionSource } from "./source";

describe("imperialCharacters repository", () => {
  it("opens imperialCharacters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = imperialCharactersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("imperialCharacters");
    expect(handle).toEqual({ name: "imperialCharacters" });
  });
});
