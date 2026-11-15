import { describe, expect, it, vi } from "vitest";
import { corporationHistoryCollection } from "./corporationHistory";
import type { CollectionSource } from "./source";

describe("corporationHistory repository", () => {
  it("opens corporationHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationHistory");
    expect(handle).toEqual({ name: "corporationHistory" });
  });
});
