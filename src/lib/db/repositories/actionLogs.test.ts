import { describe, expect, it, vi } from "vitest";
import { actionLogsCollection } from "./actionLogs";
import type { CollectionSource } from "./source";

describe("actionLogs repository", () => {
  it("opens actionLogs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = actionLogsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("actionLogs");
    expect(handle).toEqual({ name: "actionLogs" });
  });
});
