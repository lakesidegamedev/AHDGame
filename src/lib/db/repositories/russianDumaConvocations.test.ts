import { describe, expect, it, vi } from "vitest";
import { russianDumaConvocationsCollection } from "./russianDumaConvocations";
import type { CollectionSource } from "./source";

describe("russianDumaConvocations repository", () => {
  it("opens russianDumaConvocations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianDumaConvocationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianDumaConvocations");
    expect(handle).toEqual({ name: "russianDumaConvocations" });
  });
});
