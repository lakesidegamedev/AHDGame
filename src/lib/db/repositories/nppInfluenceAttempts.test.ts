import { describe, expect, it, vi } from "vitest";
import { nppInfluenceAttemptsCollection } from "./nppInfluenceAttempts";
import type { CollectionSource } from "./source";

describe("nppInfluenceAttempts repository", () => {
  it("opens nppInfluenceAttempts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppInfluenceAttemptsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppInfluenceAttempts");
    expect(handle).toEqual({ name: "nppInfluenceAttempts" });
  });
});
