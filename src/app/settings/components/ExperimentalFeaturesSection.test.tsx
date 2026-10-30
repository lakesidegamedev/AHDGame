// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentalFeaturesSection } from "./ExperimentalFeaturesSection";

const mocks = vi.hoisted(() => ({
  user: { experimentalFeatures: true, desktopNavigationLayout: "cards" },
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
  mocks.user = { experimentalFeatures: true, desktopNavigationLayout: "cards" };
});

describe("experimental desktop layout choice", () => {
  it("offers all layouts only after explicit opt-in", () => {
    mocks.user.experimentalFeatures = false;
    render(<ExperimentalFeaturesSection />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("saves a layout to the account and refreshes navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExperimentalFeaturesSection />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: /options.browser.title/ }));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/experimental-features",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ desktopNavigationLayout: "browser" }),
      })
    );
  });

  it("restores the prior choice after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    render(<ExperimentalFeaturesSection />);
    fireEvent.click(screen.getByRole("radio", { name: /options.directory.title/ }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /options.cards.title/ }).checked
    ).toBe(true);
    expect(mocks.refetch).not.toHaveBeenCalled();
  });
});
