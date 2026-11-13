import { describe, expect, it } from "vitest";
import { resolveViewAs } from "./viewAs";
import { canViewTier } from "./rules";

describe("resolveViewAs", () => {
  it("lets an admin preview each role", () => {
    expect(resolveViewAs("admin", "moderator")).toBe("moderator");
    expect(resolveViewAs("admin", "junior_dev")).toBe("junior_dev");
    expect(resolveViewAs("admin", "admin")).toBe("admin");
  });

  it("falls back to the real role for missing or unknown values", () => {
    expect(resolveViewAs("admin", undefined)).toBe("admin");
    expect(resolveViewAs("admin", "owner")).toBe("admin");
  });

  it("never lets a lower role preview a higher one", () => {
    expect(resolveViewAs("moderator", "admin")).toBe("moderator");
    expect(resolveViewAs("moderator", "junior_dev")).toBe("moderator");
    expect(resolveViewAs("junior_dev", "admin")).toBe("junior_dev");
    expect(resolveViewAs("junior_dev", "moderator")).toBe("junior_dev");
  });

  it("previews with the same permission table the server uses", () => {
    expect(canViewTier(resolveViewAs("admin", "moderator"), "admin")).toBe(false);
    expect(canViewTier(resolveViewAs("moderator", "admin"), "admin")).toBe(false);
  });
});
