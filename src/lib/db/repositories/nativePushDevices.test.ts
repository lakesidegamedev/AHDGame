import { describe, expect, it, vi } from "vitest";
import { nativePushDevicesCollection } from "./nativePushDevices";
import type { CollectionSource } from "./source";

describe("nativePushDevices repository", () => {
  it("opens nativePushDevices on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nativePushDevicesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nativePushDevices");
    expect(handle).toEqual({ name: "nativePushDevices" });
  });
});
