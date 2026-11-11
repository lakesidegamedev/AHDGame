import { describe, expect, it, vi } from "vitest";
import { wireEventsCollection } from "./wireEvents";
import type { CollectionSource } from "./source";

describe("wireEvents repository", () => {
  it("opens wireEvents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = wireEventsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("wireEvents");
    expect(handle).toEqual({ name: "wireEvents" });
  });
});
