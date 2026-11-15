import { describe, expect, it, vi } from "vitest";
import { coldWarTensionCollection } from "./coldWarTension";
import type { CollectionSource } from "./source";

describe("coldWarTension repository", () => {
  it("opens coldWarTension on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = coldWarTensionCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("coldWarTension");
    expect(handle).toEqual({ name: "coldWarTension" });
  });
});
