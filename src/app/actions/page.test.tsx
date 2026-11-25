import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { InitialActionsHero } from "./ActionsClient";
import ActionsPage from "./page";

const { findWorld, getUser } = vi.hoisted(() => ({
  findWorld: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: getUser }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/db/repositories/gameState", () => ({
  gameStateCollection: () => ({ findOne: findWorld }),
}));
vi.mock("./ActionsClient", () => ({
  default: ({ initialHero }: { initialHero: InitialActionsHero | null }) =>
    initialHero && (
      <a href={initialHero.imageUrl} data-era={initialHero.era} data-view={initialHero.viewMode}>
        {initialHero.eraLabel}
      </a>
    ),
}));

beforeEach(() => {
  getUser.mockResolvedValue({ character: { countryId: "US" }, actionsViewMode: "compact" });
  findWorld.mockResolvedValue({ currentYear: 1983, preset: "1953-default" });
});

it("passes the active character's hero for the current world era to the first render", async () => {
  const html = renderToStaticMarkup(await ActionsPage());
  expect(html).toContain("/static/actions/1979/US/hero.webp");
  expect(html).toContain('data-era="1979"');
  expect(html).toContain('data-view="compact"');
  expect(html).toContain(">1983</a>");
});

it("keeps the client fallback available without a character", async () => {
  getUser.mockResolvedValue(null);
  expect(renderToStaticMarkup(await ActionsPage())).toBe("");
});

it("keeps the client fallback available when the world lookup fails", async () => {
  findWorld.mockRejectedValue(new Error("World unavailable"));
  expect(renderToStaticMarkup(await ActionsPage())).toBe("");
});
