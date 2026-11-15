import { describe, expect, it, vi } from "vitest";
import { battleReportsCollection } from "./battleReports";
import type { CollectionSource } from "./source";

describe("battleReports repository", () => {
  it("opens battleReports on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = battleReportsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("battleReports");
    expect(handle).toEqual({ name: "battleReports" });
  });
});
