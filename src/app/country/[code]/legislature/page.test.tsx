import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import LegislaturePage from "./page";

vi.mock("./LegislatureClient", () => ({ default: () => <span>Other chambers</span> }));
vi.mock("./USLegislatureClient", () => ({ USLegislatureClient: () => <span>US chambers</span> }));
vi.mock("@/components/legislation/NationalPartyBillAction", () => ({
  NationalPartyBillAction: () => null,
}));
vi.mock("@/components/legislation/NationalImpeachmentAction", () => ({
  NationalImpeachmentAction: () => null,
}));

async function initialHtml(code: string, chamber?: string | string[]) {
  const page = await LegislaturePage({
    params: Promise.resolve({ code }),
    searchParams: Promise.resolve({ chamber }),
  });
  return renderToStaticMarkup(page);
}

it.each([
  [undefined, "senate"],
  ["house", "house"],
  [["house", "senate"], "house"],
  ["unknown", "senate"],
])("preloads only the first US chamber photo for %j", async (chamber, expected) => {
  const html = await initialHtml("us", chamber);
  expect(html).toContain(`href="/heroes/us-${expected}-chamber.webp"`);
  expect(html.match(/rel="preload"/g)).toHaveLength(1);
  expect(html).toContain('fetchPriority="high"');
  expect(html).toContain("US chambers");
});

it("leaves the US chamber photos out of other legislature pages", async () => {
  const html = await initialHtml("uk", "house");
  expect(html).not.toContain("/heroes/us-");
  expect(html).toContain("Other chambers");
});
