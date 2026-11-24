import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

// Only the header rules are under test. The real plugins load a native file
// watcher that cannot be loaded twice in one test worker.
vi.mock("next-intl/plugin", () => ({
  default: () => (config: unknown) => config,
}));
vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: (config: unknown) => config,
}));

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
