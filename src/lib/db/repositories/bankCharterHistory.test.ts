import { describe, expect, it, vi } from "vitest";
import { bankCharterHistoryCollection } from "./bankCharterHistory";
import type { CollectionSource } from "./source";

describe("bankCharterHistory repository", () => {
  it("opens bankCharterHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankCharterHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankCharterHistory");
    expect(handle).toEqual({ name: "bankCharterHistory" });
  });
});
