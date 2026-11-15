import { describe, expect, it, vi } from "vitest";
import { userSubscriptionsCollection } from "./userSubscriptions";
import type { CollectionSource } from "./source";

describe("userSubscriptions repository", () => {
  it("opens userSubscriptions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = userSubscriptionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("userSubscriptions");
    expect(handle).toEqual({ name: "userSubscriptions" });
  });
});
