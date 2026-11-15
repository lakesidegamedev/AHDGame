import { describe, expect, it, vi } from "vitest";
import { parliamentSeatsHistoryCollection } from "./parliamentSeatsHistory";
import type { CollectionSource } from "./source";

describe("parliamentSeatsHistory repository", () => {
  it("opens parliamentSeatsHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = parliamentSeatsHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("parliamentSeatsHistory");
    expect(handle).toEqual({ name: "parliamentSeatsHistory" });
  });
});
