import { describe, expect, it, vi } from "vitest";
import { producerOpeningsCollection } from "./producerOpenings";
import type { CollectionSource } from "./source";

describe("producerOpenings repository", () => {
  it("opens producerOpenings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerOpeningsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerOpenings");
    expect(handle).toEqual({ name: "producerOpenings" });
  });
});
