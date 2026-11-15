import { describe, expect, it, vi } from "vitest";
import { corporateSectorsCollection } from "./corporateSectors";
import type { CollectionSource } from "./source";

describe("corporateSectors repository", () => {
  it("opens corporateSectors on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporateSectorsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporateSectors");
    expect(handle).toEqual({ name: "corporateSectors" });
  });
});
