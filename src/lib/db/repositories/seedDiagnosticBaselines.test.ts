import { describe, expect, it, vi } from "vitest";
import { seedDiagnosticBaselinesCollection } from "./seedDiagnosticBaselines";
import type { CollectionSource } from "./source";

describe("seedDiagnosticBaselines repository", () => {
  it("opens seedDiagnosticBaselines on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = seedDiagnosticBaselinesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("seedDiagnosticBaselines");
    expect(handle).toEqual({ name: "seedDiagnosticBaselines" });
  });
});
