import { describe, expect, it, vi } from "vitest";
import { playerContentReportsCollection } from "./playerContentReports";
import type { CollectionSource } from "./source";

describe("playerContentReports repository", () => {
  it("opens playerContentReports on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerContentReportsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerContentReports");
    expect(handle).toEqual({ name: "playerContentReports" });
  });
});
