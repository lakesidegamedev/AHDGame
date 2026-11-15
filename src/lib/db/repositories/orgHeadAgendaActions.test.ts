import { describe, expect, it, vi } from "vitest";
import { orgHeadAgendaActionsCollection } from "./orgHeadAgendaActions";
import type { CollectionSource } from "./source";

describe("orgHeadAgendaActions repository", () => {
  it("opens orgHeadAgendaActions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = orgHeadAgendaActionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("orgHeadAgendaActions");
    expect(handle).toEqual({ name: "orgHeadAgendaActions" });
  });
});
