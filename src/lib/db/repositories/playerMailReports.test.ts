import { describe, expect, it, vi } from "vitest";
import { playerMailReportsCollection } from "./playerMailReports";
import type { CollectionSource } from "./source";

describe("playerMailReports repository", () => {
  it("opens playerMailReports on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerMailReportsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerMailReports");
    expect(handle).toEqual({ name: "playerMailReports" });
  });
});
