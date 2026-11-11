import { describe, expect, it, vi } from "vitest";
import { clientDiagnosticsCollection } from "./clientDiagnostics";
import type { CollectionSource } from "./source";

describe("clientDiagnostics repository", () => {
  it("opens clientDiagnostics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = clientDiagnosticsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("clientDiagnostics");
    expect(handle).toEqual({ name: "clientDiagnostics" });
  });
});
