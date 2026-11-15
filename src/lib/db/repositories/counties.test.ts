import { describe, expect, it, vi } from "vitest";
import { countiesCollection } from "./counties";
import type { CollectionSource } from "./source";

describe("counties repository", () => {
  it("opens counties on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countiesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("counties");
    expect(handle).toEqual({ name: "counties" });
  });
});
