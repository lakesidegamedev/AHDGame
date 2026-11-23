import { describe, expect, it } from "vitest";
import { defenseSeatUrl } from "./defenseSeatUrl";

describe("defenseSeatUrl", () => {
  it("points at the defence seat office when the country has one", () => {
    expect(defenseSeatUrl("US")).toMatch(/^\/country\/us\/executive\/cabinet\/.+\/office$/);
  });
});
