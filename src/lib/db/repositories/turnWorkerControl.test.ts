import { describe, expect, it, vi } from "vitest";
import { turnWorkerControlCollection } from "./turnWorkerControl";
import type { CollectionSource } from "./source";

describe("turnWorkerControl repository", () => {
  it("opens turnWorkerControl on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = turnWorkerControlCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("turnWorkerControl");
    expect(handle).toEqual({ name: "turnWorkerControl" });
  });
});
