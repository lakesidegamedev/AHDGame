import { describe, expect, it, vi } from "vitest";
import { retiredCharactersCollection } from "./retiredCharacters";
import type { CollectionSource } from "./source";

describe("retiredCharacters repository", () => {
  it("opens retiredCharacters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = retiredCharactersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("retiredCharacters");
    expect(handle).toEqual({ name: "retiredCharacters" });
  });
});
