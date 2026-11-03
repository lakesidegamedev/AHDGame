// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { makeCharacter } from "@/lib/test-utils/factories";
import { useActionsController } from "./useActionsController";
import { actionCardProps } from "./actionCardProps";

// A real router is stable across renders; a fresh object per render would refetch forever.
const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (key: string) => key;
vi.mock("next-intl", () => ({ useTranslations: () => t }));
vi.mock("@/contexts/CurrencyContext", () => ({ useCurrency: () => ({ baseRates: {} }) }));
const showToast = vi.fn();
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: () => {} }));
vi.mock("@/hooks/useWorldFlags", () => ({
  useWorldFlags: () => ({
    loaded: true,
    preset: "2019-default",
    currentYear: 2019,
    campaignPriceLevel: 1,
  }),
}));
vi.mock("@/lib/characterStatsSync", () => ({ notifyCharacterStatsUpdated: vi.fn() }));

const startChar = makeCharacter({ politicalInfluence: 12, actions: 30 });
const afterChar = { ...startChar, politicalInfluence: 17, actions: 20 };

beforeEach(() => {
  showToast.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") return new Response(JSON.stringify({ user: {} }));
      if (url.startsWith("/api/auth/character")) return new Response(JSON.stringify(startChar));
      if (url === "/api/actions/execute" && init?.method === "POST") {
        return new Response(
          JSON.stringify({ success: true, message: "Campaigned 5 times", character: afterChar })
        );
      }
      return new Response("{}", { status: 404 });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useActionsController", () => {
  it("loads the character and runs a batch through the Actions endpoint", async () => {
    const { result } = renderHook(() => useActionsController({ viewMode: "compact" }));
    await waitFor(() => expect(result.current.character?.politicalInfluence).toBe(12));
    await act(async () => {
      await result.current.execute("campaign", 5);
    });
    const post = vi.mocked(fetch).mock.calls.find(([u]) => u === "/api/actions/execute");
    expect(JSON.parse(String(post![1]!.body))).toEqual({ actionType: "campaign", count: 5 });
    expect(result.current.character?.politicalInfluence).toBe(17);
    expect(showToast).toHaveBeenCalledWith("Campaigned 5 times", "success");
  });

  it("builds card props that run the same execute", async () => {
    const { result } = renderHook(() => useActionsController({ viewMode: "compact" }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const c = result.current;
    const card = c.cards.find((x) => x.type === "campaign")!;
    const props = actionCardProps(c, card, 0, "compact");
    expect(props.character.politicalInfluence).toBe(12);
    expect(props.campaignActionCost).toBe(c.actionCosts!.campaignActionCost);
    expect(props.imageUrl).toBe(c.cardImages.campaign);
  });
});

it("does not fetch protected resources while browsing without a character", async () => {
  const { result } = renderHook(() =>
    useActionsController({ viewMode: "compact", enabled: false })
  );
  await act(async () => {
    await result.current.fetchCharacter();
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(result.current.character).toBeNull();
});
