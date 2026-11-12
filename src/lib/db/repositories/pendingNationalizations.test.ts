import { describe, expect, it, vi } from "vitest";
import { pendingNationalizationsCollection } from "./pendingNationalizations";
import type { CollectionSource } from "./source";

describe("pendingNationalizations repository", () => {
  it("opens pendingNationalizations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = pendingNationalizationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("pendingNationalizations");
    expect(handle).toEqual({ name: "pendingNationalizations" });
  });
});
