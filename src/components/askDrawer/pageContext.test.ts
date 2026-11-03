// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { capturePageContext, normalizePageText, pageLabel } from "./pageContext";

describe("normalizePageText", () => {
  it("collapses whitespace, drops blank and repeated lines, and caps length", () => {
    expect(normalizePageText("  Cash   1,200 \n\n\nCash   1,200\nDebt 5 ")).toBe(
      "Cash 1,200\nDebt 5"
    );
    const long = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(200)}`).join("\n");
    expect(normalizePageText(long, 1000).length).toBeLessThanOrEqual(1000);
  });
});

describe("capturePageContext", () => {
  it("reads only the main content", () => {
    document.title = "Acme Steel | A House Divided";
    document.body.innerHTML =
      '<nav>Navbar text</nav><main id="main-content"><h1>Acme Steel</h1><p>Cash 1,200</p></main><aside>Drawer</aside>';
    const ctx = capturePageContext();
    expect(ctx.title).toBe("Acme Steel");
    expect(ctx.heading).toBe("Acme Steel");
    expect(ctx.path).toBe("/");
    expect(pageLabel(ctx)).toBe("Acme Steel");
    expect(ctx.text).not.toContain("Navbar");
    expect(ctx.text).not.toContain("Drawer");
  });
});
