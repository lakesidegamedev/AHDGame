import { describe, expect, it, vi } from "vitest";
import { defenceContractsCollection } from "./defenceContracts";
import type { CollectionSource } from "./source";

describe("defenceContracts repository", () => {
  it("opens defenceContracts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = defenceContractsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("defenceContracts");
    expect(handle).toEqual({ name: "defenceContracts" });
  });
});
