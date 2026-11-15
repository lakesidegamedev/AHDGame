import { describe, expect, it, vi } from "vitest";
import { corporationExitsCollection } from "./corporationExits";
import type { CollectionSource } from "./source";

describe("corporationExits repository", () => {
  it("opens corporationExits on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationExitsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationExits");
    expect(handle).toEqual({ name: "corporationExits" });
  });
});
