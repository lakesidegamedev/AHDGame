import { describe, expect, it, vi } from "vitest";
import { healBackupsCollection } from "./healBackups";
import type { CollectionSource } from "./source";

describe("healBackups repository", () => {
  it("opens healBackups on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = healBackupsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("healBackups");
    expect(handle).toEqual({ name: "healBackups" });
  });
});
