import { describe, expect, it, vi } from "vitest";
import { suspiciousCharactersCollection } from "./suspiciousCharacters";
import type { CollectionSource } from "./source";

describe("suspiciousCharacters repository", () => {
  it("opens suspiciousCharacters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = suspiciousCharactersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("suspiciousCharacters");
    expect(handle).toEqual({ name: "suspiciousCharacters" });
  });
});
