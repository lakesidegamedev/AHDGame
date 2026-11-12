import { describe, expect, it, vi } from "vitest";
import { vietnamEscalationCollection } from "./vietnamEscalation";
import type { CollectionSource } from "./source";

describe("vietnamEscalation repository", () => {
  it("opens vietnamEscalation on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = vietnamEscalationCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("vietnamEscalation");
    expect(handle).toEqual({ name: "vietnamEscalation" });
  });
});
