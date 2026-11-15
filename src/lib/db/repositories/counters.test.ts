import { describe, expect, it, vi } from "vitest";
import { countersCollection } from "./counters";
import type { CollectionSource } from "./source";

describe("counters repository", () => {
  it("opens counters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("counters");
    expect(handle).toEqual({ name: "counters" });
  });
});
