import { describe, expect, it, vi } from "vitest";
import { pmAppointmentVotesCollection } from "./pmAppointmentVotes";
import type { CollectionSource } from "./source";

describe("pmAppointmentVotes repository", () => {
  it("opens pmAppointmentVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = pmAppointmentVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("pmAppointmentVotes");
    expect(handle).toEqual({ name: "pmAppointmentVotes" });
  });
});
