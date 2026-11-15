import { describe, expect, it, vi } from "vitest";
import { ukNhsStateCollection } from "./ukNhsState";
import type { CollectionSource } from "./source";

describe("ukNhsState repository", () => {
  it("opens ukNhsState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukNhsStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukNhsState");
    expect(handle).toEqual({ name: "ukNhsState" });
  });
});
