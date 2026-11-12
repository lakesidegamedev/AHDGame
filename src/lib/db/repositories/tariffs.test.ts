import { describe, expect, it, vi } from "vitest";
import { tariffsCollection } from "./tariffs";
import type { CollectionSource } from "./source";

describe("tariffs repository", () => {
  it("opens tariffs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = tariffsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("tariffs");
    expect(handle).toEqual({ name: "tariffs" });
  });
});
