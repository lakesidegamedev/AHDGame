import { describe, expect, it, vi } from "vitest";
import { centralLoginShadowEventsCollection } from "./centralLoginShadowEvents";
import type { CollectionSource } from "./source";

describe("centralLoginShadowEvents repository", () => {
  it("opens centralLoginShadowEvents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = centralLoginShadowEventsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("centralLoginShadowEvents");
    expect(handle).toEqual({ name: "centralLoginShadowEvents" });
  });
});
