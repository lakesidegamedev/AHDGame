import { describe, expect, it, vi } from "vitest";
import { stateDemographicsBackupCollection } from "./stateDemographicsBackup";
import type { CollectionSource } from "./source";

describe("stateDemographicsBackup repository", () => {
  it("opens stateDemographicsBackup on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateDemographicsBackupCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateDemographicsBackup");
    expect(handle).toEqual({ name: "stateDemographicsBackup" });
  });
});
