import { describe, expect, it, vi } from "vitest";
import { bannedDevicesCollection } from "./bannedDevices";
import type { CollectionSource } from "./source";

describe("bannedDevices repository", () => {
  it("opens bannedDevices on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bannedDevicesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bannedDevices");
    expect(handle).toEqual({ name: "bannedDevices" });
  });
});
