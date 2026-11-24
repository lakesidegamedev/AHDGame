import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("page header rules", () => {
  it("never set no-transform on a page, which switches off compression", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const pageRules = rules.filter(
      (rule) => !rule.source.startsWith("/api/") && rule.source !== "/sw.js"
    );
    expect(pageRules.length).toBeGreaterThan(0);
    for (const rule of pageRules) {
      for (const header of rule.headers) {
        if (header.key.toLowerCase() === "cache-control") {
          expect(header.value, rule.source).not.toContain("no-transform");
        }
      }
    }
  });
});
