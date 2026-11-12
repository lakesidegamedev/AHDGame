import { describe, expect, it, vi } from "vitest";
import { nationalDoctrineCollection } from "./nationalDoctrine";
import type { CollectionSource } from "./source";

describe("nationalDoctrine repository", () => {
  it("opens nationalDoctrine on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalDoctrineCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalDoctrine");
    expect(handle).toEqual({ name: "nationalDoctrine" });
  });
});
