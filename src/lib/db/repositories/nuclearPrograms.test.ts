import { describe, expect, it, vi } from "vitest";
import { nuclearProgramsCollection } from "./nuclearPrograms";
import type { CollectionSource } from "./source";

describe("nuclearPrograms repository", () => {
  it("opens nuclearPrograms on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nuclearProgramsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nuclearPrograms");
    expect(handle).toEqual({ name: "nuclearPrograms" });
  });
});
