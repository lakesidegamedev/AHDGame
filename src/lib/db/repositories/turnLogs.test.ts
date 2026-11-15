import { describe, expect, it, vi } from "vitest";
import { turnLogsCollection } from "./turnLogs";
import type { CollectionSource } from "./source";

describe("turnLogs repository", () => {
  it("opens turnLogs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = turnLogsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("turnLogs");
    expect(handle).toEqual({ name: "turnLogs" });
  });
});
