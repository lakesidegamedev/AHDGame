import { describe, expect, it, vi } from "vitest";
import { federationRatificationsCollection } from "./federationRatifications";
import type { CollectionSource } from "./source";

describe("federationRatifications repository", () => {
  it("opens federationRatifications on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationRatificationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationRatifications");
    expect(handle).toEqual({ name: "federationRatifications" });
  });
});
