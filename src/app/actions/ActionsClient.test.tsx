// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ActionsClient, { type InitialActionsHero } from "./ActionsClient";

vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image={src} />,
}));
vi.mock("@/contexts/CurrencyContext", () => ({ useCurrency: () => ({ baseRates: {} }) }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => null }));
vi.mock("./useActionsController", async () => {
  const { CARDS } = await import("./actionsConstants");
  return {
    useActionsController: () => ({
      ready: false,
      character: null,
      actionCosts: null,
      cards: CARDS,
    }),
  };
});

afterEach(cleanup);

const initialHero: InitialActionsHero = {
  imageUrl: "https://cdn.ahousedividedgame.com/static/actions/1953/US/hero.webp",
  eraLabel: "1953",
  era: "1953",
  countryId: "US",
};

it("uses the current artwork in the first document and respects an account's compact view", () => {
  const cards = renderToStaticMarkup(<ActionsClient initialHero={initialHero} />);
  expect(cards).toContain("/static/actions/1953/US/campaign.webp");
  expect(cards).toContain('data-coach="action-campaign"');

  const compact = renderToStaticMarkup(
    <ActionsClient initialHero={{ ...initialHero, viewMode: "compact" }} />
  );
  expect(compact).toContain('data-coach="action-campaign"');
  expect(compact).not.toContain("/static/actions/1953/US/campaign.webp");
});

it("shows browsable, disabled operation cards while live costs are loading", () => {
  render(<ActionsClient initialHero={null} />);

  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(11);
  const research = screen.getByRole("tab", { name: /Intelligence/ });
  fireEvent.click(research);
  expect(research.getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("heading", { name: "Campaign", level: 3 })).toBeNull();
  const grid = screen.getByRole("region", { name: /Intelligence/ });
  const buttons = within(grid).getAllByRole("button");
  expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
  expect(within(grid).queryByRole("link")).toBeNull();
});
