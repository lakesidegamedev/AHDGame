// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QuoteBoard } from "./QuoteBoard";

afterEach(cleanup);

const money = { code: "USD", fmtPrice: (n: number) => n.toFixed(2) } as never;

describe("QuoteBoard range", () => {
  it("includes the live price when it is above the drawn series", () => {
    const { container } = render(
      <QuoteBoard
        money={money}
        price={6.84}
        series={[3.17, 4.5, 6.19]}
        dayChange={null}
        poolActive={false}
      />
    );
    expect(container.textContent).toContain("Low 3.17");
    expect(container.textContent).toContain("High 6.84");
  });
});
