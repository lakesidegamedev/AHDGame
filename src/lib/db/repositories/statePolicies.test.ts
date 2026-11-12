import { describe, expect, it, vi } from "vitest";
import { statePoliciesCollection } from "./statePolicies";
import type { CollectionSource } from "./source";

describe("statePolicies repository", () => {
  it("opens statePolicies on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statePoliciesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("statePolicies");
    expect(handle).toEqual({ name: "statePolicies" });
  });
});
