import { describe, expect, it, vi } from "vitest";
import { modAuditLogCollection } from "./modAuditLog";
import type { CollectionSource } from "./source";

describe("modAuditLog repository", () => {
  it("opens modAuditLog on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = modAuditLogCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("modAuditLog");
    expect(handle).toEqual({ name: "modAuditLog" });
  });
});
