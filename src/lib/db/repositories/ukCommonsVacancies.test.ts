import { describe, expect, it, vi } from "vitest";
import { ukCommonsVacanciesCollection } from "./ukCommonsVacancies";
import type { CollectionSource } from "./source";

describe("ukCommonsVacancies repository", () => {
  it("opens ukCommonsVacancies on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukCommonsVacanciesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukCommonsVacancies");
    expect(handle).toEqual({ name: "ukCommonsVacancies" });
  });
});
