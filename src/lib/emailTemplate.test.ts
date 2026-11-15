import { describe, expect, it } from "vitest";
import { renderBrandedEmail } from "./emailTemplate";

const base = {
  preheader: "Preview line",
  heading: "Reset your password",
  paragraphs: ["First paragraph.", "Second paragraph."],
  cta: { label: "Reset it", url: "https://example.com/reset?token=abc&x=1" },
  footnote: "This link lasts 30 minutes.",
};

describe("renderBrandedEmail", () => {
  it("includes the cta url and every paragraph in html and text", () => {
    const { html, text } = renderBrandedEmail(base);
    expect(html).toContain("https://example.com/reset?token=abc&amp;x=1");
    expect(text).toContain("https://example.com/reset?token=abc&x=1");
    for (const p of [...base.paragraphs, base.footnote]) {
      expect(html).toContain(p);
      expect(text).toContain(p);
    }
    expect(html).toContain('alt="A House Divided"');
    expect(html).toContain("https://ahousedividedgame.com/ahd-logo.png");
  });

  it("escapes hostile text", () => {
    const { html } = renderBrandedEmail({
      ...base,
      heading: `<script>alert(1)</script>`,
      paragraphs: [`"><img src=x onerror=1> 'quoted'`],
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects unsafe urls", () => {
    expect(() =>
      renderBrandedEmail({ ...base, cta: { label: "x", url: "javascript:alert(1)" } })
    ).toThrow();
    expect(() =>
      renderBrandedEmail({ ...base, cta: { label: "x", url: 'https://a.com/"onclick="x' } })
    ).toThrow();
    expect(() => renderBrandedEmail({ ...base, baseUrl: "ftp://x" })).toThrow();
  });

  it("allows localhost and emits no style or script tags", () => {
    const { html } = renderBrandedEmail({
      ...base,
      cta: { label: "x", url: "http://localhost:3000/a" },
    });
    expect(html).not.toMatch(/<style|<script/i);
  });

  it("works without a cta", () => {
    const { html, text } = renderBrandedEmail({ ...base, cta: undefined });
    expect(html).toContain("First paragraph.");
    expect(text).not.toContain("Reset it:");
  });
});
