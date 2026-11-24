import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HeroImage } from "./HeroImage";

it("preloads the matching source for a responsive priority image", () => {
  const html = renderToStaticMarkup(
    <HeroImage src="/heroes/wide.webp" mobileSrc="/heroes/phone.webp" alt="" priority />
  );
  const hints = html.match(/<link[^>]*rel="preload"[^>]*>/g);
  expect(hints).toHaveLength(2);
  expect(hints?.find((hint) => hint.includes("phone.webp"))).toContain(
    'media="(width &lt; 640px)"'
  );
  expect(hints?.find((hint) => hint.includes("wide.webp"))).toContain(
    'media="(width &gt;= 640px)"'
  );
  expect(html).toContain('<source media="(width &lt; 640px)" srcSet="/heroes/phone.webp"');
  expect(html).toContain('src="/heroes/wide.webp"');
});

it("keeps the existing single-image preload without a phone variant", () => {
  const html = renderToStaticMarkup(<HeroImage src="/heroes/wide.webp" alt="" priority />);
  expect(html.match(/<link[^>]*rel="preload"[^>]*>/g)).toHaveLength(1);
  expect(html).toContain('href="/heroes/wide.webp"');
  expect(html).not.toContain("<picture>");
});
