import { describe, expect, it, vi } from "vitest";
import { supremeCourtSeatsCollection } from "./supremeCourtSeats";
import type { CollectionSource } from "./source";

describe("supremeCourtSeats repository", () => {
  it("opens supremeCourtSeats on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = supremeCourtSeatsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("supremeCourtSeats");
    expect(handle).toEqual({ name: "supremeCourtSeats" });
  });
});
