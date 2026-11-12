import { describe, expect, it, vi } from "vitest";
import { globalAlertsCollection } from "./globalAlerts";
import type { CollectionSource } from "./source";

describe("globalAlerts repository", () => {
  it("opens globalAlerts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = globalAlertsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("globalAlerts");
    expect(handle).toEqual({ name: "globalAlerts" });
  });
});
