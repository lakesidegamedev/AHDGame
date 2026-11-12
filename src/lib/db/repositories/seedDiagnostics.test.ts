import { describe, expect, it, vi } from "vitest";
import { seedDiagnosticsCollection } from "./seedDiagnostics";
import type { CollectionSource } from "./source";

describe("seedDiagnostics repository", () => {
  it("opens seedDiagnostics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = seedDiagnosticsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("seedDiagnostics");
    expect(handle).toEqual({ name: "seedDiagnostics" });
  });
});
