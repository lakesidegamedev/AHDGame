import { describe, expect, it, vi } from "vitest";
import { actionAuditLogCollection } from "./actionAuditLog";
import type { CollectionSource } from "./source";

describe("actionAuditLog repository", () => {
  it("opens actionAuditLog on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = actionAuditLogCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("actionAuditLog");
    expect(handle).toEqual({ name: "actionAuditLog" });
  });
});
