import { describe, expect, it, vi } from "vitest";
import { nppOperatorDiagnosticsCollection } from "./nppOperatorDiagnostics";
import type { CollectionSource } from "./source";

describe("nppOperatorDiagnostics repository", () => {
  it("opens nppOperatorDiagnostics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppOperatorDiagnosticsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppOperatorDiagnostics");
    expect(handle).toEqual({ name: "nppOperatorDiagnostics" });
  });
});
