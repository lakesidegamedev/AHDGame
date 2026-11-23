// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CategoryHeading from "./CategoryHeading";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";

describe("CategoryHeading donor figures", () => {
  it("shows the next level cost as the local face value the card shows", () => {
    render(
      <CategoryHeading
        category="money"
        count={3}
        donor={{ level: 2, fundraiseYield: 1000, currency: "USD", upgradeCost: 8765 }}
      />
    );
    expect(screen.getByText("Next level costs").nextSibling?.textContent).toBe(
      formatCurrencyFaceAmount(8765, "USD")
    );
  });
});
