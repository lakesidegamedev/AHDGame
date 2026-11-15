import { describe, expect, it, vi } from "vitest";
import { unownedSectorsCollection } from "./unownedSectors";
import type { CollectionSource } from "./source";

describe("unownedSectors repository", () => {
  it("opens unownedSectors on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unownedSectorsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unownedSectors");
    expect(handle).toEqual({ name: "unownedSectors" });
  });
});
