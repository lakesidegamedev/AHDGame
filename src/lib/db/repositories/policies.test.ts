import { describe, expect, it, vi } from "vitest";
import { policiesCollection } from "./policies";
import type { CollectionSource } from "./source";

describe("policies repository", () => {
  it("opens policies on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = policiesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("policies");
    expect(handle).toEqual({ name: "policies" });
  });
});
