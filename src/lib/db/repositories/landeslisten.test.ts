import { describe, expect, it, vi } from "vitest";
import { landeslistenCollection } from "./landeslisten";
import type { CollectionSource } from "./source";

describe("landeslisten repository", () => {
  it("opens landeslisten on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = landeslistenCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("landeslisten");
    expect(handle).toEqual({ name: "landeslisten" });
  });
});
