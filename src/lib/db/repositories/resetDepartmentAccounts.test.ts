import { describe, expect, it, vi } from "vitest";
import { resetDepartmentAccountsCollection } from "./resetDepartmentAccounts";
import type { CollectionSource } from "./source";

describe("resetDepartmentAccounts repository", () => {
  it("opens resetDepartmentAccounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetDepartmentAccountsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetDepartmentAccounts");
    expect(handle).toEqual({ name: "resetDepartmentAccounts" });
  });
});
