import { describe, expect, it, vi } from "vitest";
import { systemSettingsCollection } from "./systemSettings";
import type { CollectionSource } from "./source";

describe("systemSettings repository", () => {
  it("opens systemSettings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = systemSettingsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("systemSettings");
    expect(handle).toEqual({ name: "systemSettings" });
  });
});
