import { describe, expect, it, vi } from "vitest";
import { bankingTelemetryCollection } from "./bankingTelemetry";
import type { CollectionSource } from "./source";

describe("bankingTelemetry repository", () => {
  it("opens bankingTelemetry on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankingTelemetryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankingTelemetry");
    expect(handle).toEqual({ name: "bankingTelemetry" });
  });
});
