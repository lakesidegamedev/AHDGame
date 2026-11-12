import { describe, expect, it, vi } from "vitest";
import { russianAssemblySeatingsCollection } from "./russianAssemblySeatings";
import type { CollectionSource } from "./source";

describe("russianAssemblySeatings repository", () => {
  it("opens russianAssemblySeatings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianAssemblySeatingsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianAssemblySeatings");
    expect(handle).toEqual({ name: "russianAssemblySeatings" });
  });
});
