import { describe, expect, it, vi } from "vitest";
import { capitalActionLogsCollection } from "./capitalActionLogs";
import type { CollectionSource } from "./source";

describe("capitalActionLogs repository", () => {
  it("opens capitalActionLogs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = capitalActionLogsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("capitalActionLogs");
    expect(handle).toEqual({ name: "capitalActionLogs" });
  });
});
