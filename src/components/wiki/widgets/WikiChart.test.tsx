/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WikiChart } from "./WikiChart";
import { WIKI_CHARTS } from "@/lib/wiki/charts";

describe("WikiChart", () => {
  it("renders nothing for an unknown id", () => {
    expect(renderToStaticMarkup(<WikiChart data="no-such-chart" />)).toBe("");
    expect(renderToStaticMarkup(<WikiChart />)).toBe("");
  });

  it("renders an accessible figure for a registered chart", () => {
    const id = Object.keys(WIKI_CHARTS)[0];
    if (!id) return;
    const html = renderToStaticMarkup(<WikiChart data={id} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-label=");
  });
});
