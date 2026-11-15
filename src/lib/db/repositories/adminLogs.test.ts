import { describe, expect, it, vi } from "vitest";
import { adminLogsCollection } from "./adminLogs";
import type { CollectionSource } from "./source";

describe("adminLogs repository", () => {
  it("opens adminLogs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = adminLogsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("adminLogs");
    expect(handle).toEqual({ name: "adminLogs" });
  });
});
