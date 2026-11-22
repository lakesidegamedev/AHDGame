// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Delta, Figure } from "./Figure";

describe("Figure and Delta", () => {
  it("renders a neutral plain figure", () => {
    const { container } = render(<Figure kind="count" value={1500} />);
    expect(container.textContent).toBe("1,500");
    expect(container.firstElementChild?.className).toContain("text-foreground");
  });
  it("renders signed gain and loss deltas", () => {
    const up = render(<Delta kind="percent" value={2.5} />).container;
    expect(up.textContent).toBe("+2.5%");
    expect(up.firstElementChild?.className).toContain("text-success");
    const down = render(<Delta kind="money" value={-10} />).container;
    expect(down.textContent).toBe("-$10");
    expect(down.firstElementChild?.className).toContain("text-error");
  });
  it("keeps zero neutral and inverts costs", () => {
    const zero = render(<Delta kind="percent" value={0} />).container;
    expect(zero.firstElementChild?.className).toContain("text-foreground");
    const cost = render(<Delta kind="money" value={5} invert />).container;
    expect(cost.firstElementChild?.className).toContain("text-error");
  });
  it("uses a supplied money formatter", () => {
    const { container } = render(
      <Delta kind="money" value={-3} formatMoneyValue={(n) => `€${n}`} />
    );
    expect(container.textContent).toBe("-€3");
  });
});
