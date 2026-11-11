import { describe, expect, it, vi } from "vitest";
import { bannedIpsCollection } from "./bannedIps";
import type { CollectionSource } from "./source";

describe("bannedIps repository", () => {
  it("opens bannedIps on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bannedIpsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bannedIps");
    expect(handle).toEqual({ name: "bannedIps" });
  });
});
