import { describe, expect, it, vi } from "vitest";
import { botApiKeysCollection } from "./botApiKeys";
import type { CollectionSource } from "./source";

describe("botApiKeys repository", () => {
  it("opens botApiKeys on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = botApiKeysCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("botApiKeys");
    expect(handle).toEqual({ name: "botApiKeys" });
  });
});
