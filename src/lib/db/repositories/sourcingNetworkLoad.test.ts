import { describe, expect, it, vi } from "vitest";
import { sourcingNetworkLoadCollection } from "./sourcingNetworkLoad";
import type { CollectionSource } from "./source";

describe("sourcingNetworkLoad repository", () => {
  it("opens sourcingNetworkLoad on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sourcingNetworkLoadCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sourcingNetworkLoad");
    expect(handle).toEqual({ name: "sourcingNetworkLoad" });
  });
});
