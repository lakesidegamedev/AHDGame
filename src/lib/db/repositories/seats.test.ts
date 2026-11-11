import { describe, expect, it, vi } from "vitest";
import { seatsCollection } from "./seats";
import type { CollectionSource } from "./source";

describe("seats repository", () => {
  it("opens seats on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = seatsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("seats");
    expect(handle).toEqual({ name: "seats" });
  });
});
