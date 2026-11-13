import { describe, expect, it } from "vitest";
import { resolveViewAs } from "./viewAs";
import { canViewTier } from "./rules";
import { navFor, TOOLS } from "./panelRegistry";

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

  it("filters the panel so each previewed role sees exactly its tools", () => {
    const ids = (role: Parameters<typeof resolveViewAs>[1]) =>
      navFor(resolveViewAs("admin", role)).flatMap((g) => g.tools.map((t) => t.id));
    const moderatorTools = TOOLS.filter((t) => t.tier === "moderator").map((t) => t.id);
    expect(ids("moderator").sort()).toEqual([...moderatorTools].sort());
    expect(ids("junior_dev").sort()).toEqual(TOOLS.map((t) => t.id).sort());
    expect(ids("admin").sort()).toEqual(TOOLS.map((t) => t.id).sort());
  });
});
