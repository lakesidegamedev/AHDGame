// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { makeCharacter } from "@/lib/test-utils/factories";
import ActionsHero from "./ActionsHero";

vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: String }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("loads the private portfolio summary when the funds breakdown opens", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ liquidCashWealth: 120 }),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ActionsHero
      character={makeCharacter()}
      imageUrl="/heroes/example.webp"
      campaignFundsDisplay={100}
      campaignFundsCurrency="USD"
      influence={20}
      infamy={0}
      influenceDecay="0"
    />
  );

  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show funds breakdown" }));
  expect(await screen.findByText("Personal cash, all currencies")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith("/api/character/portfolio?summary=1", expect.any(Object));
});
