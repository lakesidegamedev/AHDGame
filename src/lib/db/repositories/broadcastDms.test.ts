import { describe, expect, it, vi } from "vitest";
import { broadcastDmsCollection } from "./broadcastDms";
import type { CollectionSource } from "./source";

describe("broadcastDms repository", () => {
  it("opens broadcastDms on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = broadcastDmsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("broadcastDms");
    expect(handle).toEqual({ name: "broadcastDms" });
  });
});
