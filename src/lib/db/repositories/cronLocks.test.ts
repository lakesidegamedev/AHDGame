import { describe, expect, it, vi } from "vitest";
import { cronLocksCollection } from "./cronLocks";
import type { CollectionSource } from "./source";

describe("cronLocks repository", () => {
  it("opens cronLocks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cronLocksCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cronLocks");
    expect(handle).toEqual({ name: "cronLocks" });
  });
});
