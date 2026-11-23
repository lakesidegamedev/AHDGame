import { describe, expect, it } from "vitest";
import { IMF_INSTITUTION_PLAYER_DESCRIPTION } from "./constants";

describe("IMF_INSTITUTION_PLAYER_DESCRIPTION", () => {
  it("does not imply country programmes and carries no admin instructions", () => {
    expect(IMF_INSTITUTION_PLAYER_DESCRIPTION).toMatch(/cannot apply for IMF programmes/);
    expect(IMF_INSTITUTION_PLAYER_DESCRIPTION).not.toMatch(/Admin must|Checklist/);
    expect(IMF_INSTITUTION_PLAYER_DESCRIPTION).not.toMatch(/[–—]/);
  });
});
