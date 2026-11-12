import { describe, expect, it, vi } from "vitest";
import { unionEndorsementsCollection } from "./unionEndorsements";
import type { CollectionSource } from "./source";

describe("unionEndorsements repository", () => {
  it("opens unionEndorsements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unionEndorsementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unionEndorsements");
    expect(handle).toEqual({ name: "unionEndorsements" });
  });
});
