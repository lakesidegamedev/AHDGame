// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/nav.json";
import { WatchButton } from "./WatchButton";
import { resetWatchlistStore } from "./useWatchlist";

const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock("@/contexts/AuthDataContext", () => ({
  useOptionalAuthMe: () => ({ user: auth.user, navData: { user: auth.user, hasCharacter: true } }),
  useRefetchNav: () => () => undefined,
}));

const w = en.nav.widgets.watchlist;

function renderButton(id: string | number | null = 4) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WatchButton kind="corporation" id={id} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  resetWatchlistStore();
  auth.user = { experimentalFeatures: true, widgetWatchlist: [{ kind: "commodity", id: "oil" }] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WatchButton", () => {
  it("is hidden unless experimental features are on, and without an id", () => {
    auth.user = { experimentalFeatures: false };
    renderButton();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    auth.user = { experimentalFeatures: true };
    renderButton(null);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("adds the item to the end of the watchlist and shows it as watched", () => {
    renderButton();
    const button = screen.getByRole("button", { name: w.watch });
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain(w.unwatch);
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({
      widgetWatchlist: [
        { kind: "commodity", id: "oil" },
        { kind: "corporation", id: "4" },
      ],
    });
  });

  it("does not add past the cap", () => {
    auth.user = {
      experimentalFeatures: true,
      widgetWatchlist: Array.from({ length: 20 }, (_, i) => ({
        kind: "corporation",
        id: String(i + 100),
      })),
    };
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: w.watch }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
