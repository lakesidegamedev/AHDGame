import { describe, expect, it, vi } from "vitest";
import { trucesCollection } from "./truces";
import type { CollectionSource } from "./source";

describe("truces repository", () => {
  it("opens truces on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = trucesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("truces");
    expect(handle).toEqual({ name: "truces" });
  });
});
