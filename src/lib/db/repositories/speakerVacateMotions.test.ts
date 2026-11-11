import { describe, expect, it, vi } from "vitest";
import { speakerVacateMotionsCollection } from "./speakerVacateMotions";
import type { CollectionSource } from "./source";

describe("speakerVacateMotions repository", () => {
  it("opens speakerVacateMotions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = speakerVacateMotionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("speakerVacateMotions");
    expect(handle).toEqual({ name: "speakerVacateMotions" });
  });
});
