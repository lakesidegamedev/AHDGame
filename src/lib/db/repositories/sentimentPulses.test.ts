import { describe, expect, it, vi } from "vitest";
import { sentimentPulsesCollection } from "./sentimentPulses";
import type { CollectionSource } from "./source";

describe("sentimentPulses repository", () => {
  it("opens sentimentPulses on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sentimentPulsesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sentimentPulses");
    expect(handle).toEqual({ name: "sentimentPulses" });
  });
});
