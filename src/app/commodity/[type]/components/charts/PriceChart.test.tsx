// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PriceChart from "./PriceChart";

afterEach(cleanup);

const history = [
  { turn: 1, price: 600, supply: 1, demand: 1 },
  { turn: 2, price: 800, supply: 1, demand: 1 },
];

describe("PriceChart currency scale", () => {
  it("draws the base line and prices in the same scaled currency as the header", () => {
    const { container } = render(
      <PriceChart history={history} basePrice={800} priceScale={0.5} formatValue={(v) => `C${v}`} />
    );
    const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(labels).toContain("C400");
    expect(labels).not.toContain("C800");
  });
  it("leaves values untouched by default", () => {
    const { container } = render(<PriceChart history={history} basePrice={800} />);
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toContain("$800");
  });
});
