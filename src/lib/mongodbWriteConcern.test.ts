import { describe, expect, it } from "vitest";
import { resolveMongoWriteConcern } from "./mongodb";

describe("resolveMongoWriteConcern", () => {
  it("keeps the server default when unset or unrecognized", () => {
    expect(resolveMongoWriteConcern({ AHD_TURN_WORKER_PROCESS: "1" })).toBeUndefined();
    expect(
      resolveMongoWriteConcern({ AHD_TURN_WORKER_PROCESS: "1", TURN_WRITE_CONCERN: "majority" })
    ).toBeUndefined();
  });
  it("acknowledges on apply in the turn worker", () => {
    expect(
      resolveMongoWriteConcern({ AHD_TURN_WORKER_PROCESS: "1", TURN_WRITE_CONCERN: " W1 " })
    ).toEqual({ w: 1 });
  });
  it("is ignored outside the turn worker", () => {
    expect(resolveMongoWriteConcern({ TURN_WRITE_CONCERN: "w1" })).toBeUndefined();
  });
});
