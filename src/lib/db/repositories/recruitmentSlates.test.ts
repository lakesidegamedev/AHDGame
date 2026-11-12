import { describe, expect, it, vi } from "vitest";
import { recruitmentSlatesCollection } from "./recruitmentSlates";
import type { CollectionSource } from "./source";

describe("recruitmentSlates repository", () => {
  it("opens recruitmentSlates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = recruitmentSlatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("recruitmentSlates");
    expect(handle).toEqual({ name: "recruitmentSlates" });
  });
});
