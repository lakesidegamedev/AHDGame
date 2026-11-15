import { describe, expect, it, vi } from "vitest";
import { userApiKeysCollection } from "./userApiKeys";
import type { CollectionSource } from "./source";

describe("userApiKeys repository", () => {
  it("opens userApiKeys on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = userApiKeysCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("userApiKeys");
    expect(handle).toEqual({ name: "userApiKeys" });
  });
});
