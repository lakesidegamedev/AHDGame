import { describe, expect, it, vi } from "vitest";
import { resetLawProgramsCollection } from "./resetLawPrograms";
import type { CollectionSource } from "./source";

describe("resetLawPrograms repository", () => {
  it("opens resetLawPrograms on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetLawProgramsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetLawPrograms");
    expect(handle).toEqual({ name: "resetLawPrograms" });
  });
});
