// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationLayoutSection } from "./NavigationLayoutSection";

const mocks = vi.hoisted(() => ({
  user: { experimentalFeatures: false } as Record<string, unknown>,
  refetch: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/contexts/AuthDataContext", () => ({ useAuthMe: () => mocks }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => mocks }));
vi.mock("@/contexts/InterfaceContext", () => ({ useInterface: () => ({ mode: "modern" }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { experimentalFeatures: false };
});

describe("navigation layout choice", () => {
  it("offers both layouts to players without experimental features, cards and dock first", () => {
    render(<NavigationLayoutSection />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /desktop.options.cards.title/ }).checked
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /mobile.options.dock.title/ }).checked
    ).toBe(true);
  });

  it("shows a saved standard choice", () => {
    mocks.user = { desktopNavigationLayout: "standard", mobileNavigationLayout: "standard" };
    render(<NavigationLayoutSection />);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /desktop.options.standard.title/ })
        .checked
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /mobile.options.standard.title/ }).checked
    ).toBe(true);
  });

  it("saves a layout to the account and refreshes navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<NavigationLayoutSection />);
    fireEvent.click(screen.getByRole("radio", { name: /desktop.options.standard.title/ }));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/experimental-features",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ desktopNavigationLayout: "standard" }),
      })
    );
  });

  it("restores the prior choice after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    render(<NavigationLayoutSection />);
    fireEvent.click(screen.getByRole("radio", { name: /desktop.options.standard.title/ }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /options.cards.title/ }).checked
    ).toBe(true);
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("saves the phone layout separately from the desktop layout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<NavigationLayoutSection />);
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /mobile.options.dock.title/ }).checked
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /mobile.options.standard.title/ }));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/experimental-features",
      expect.objectContaining({ body: JSON.stringify({ mobileNavigationLayout: "standard" }) })
    );
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /desktop.options.cards.title/ }).checked
    ).toBe(true);
  });
});
