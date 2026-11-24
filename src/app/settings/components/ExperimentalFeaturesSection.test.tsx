// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentalFeaturesSection } from "./ExperimentalFeaturesSection";

const mocks = vi.hoisted(() => ({
  user: { experimentalFeatures: true } as { experimentalFeatures: boolean },
  refetch: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/contexts/AuthDataContext", () => ({ useAuthMe: () => mocks }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => mocks }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { experimentalFeatures: true };
});

describe("experimental features section", () => {
  it("holds only the opt-in switch; navigation layouts live under Appearance", () => {
    render(<ExperimentalFeaturesSection />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("words the switch hint to match the switch state", () => {
    mocks.user.experimentalFeatures = false;
    const { unmount } = render(<ExperimentalFeaturesSection />);
    expect(screen.getByText("experimental.toggleHintOff")).toBeTruthy();
    unmount();
    mocks.user.experimentalFeatures = true;
    render(<ExperimentalFeaturesSection />);
    expect(screen.getByText("experimental.toggleHintOn")).toBeTruthy();
  });

  it("saves the opt-in and puts the switch back after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    mocks.user.experimentalFeatures = false;
    render(<ExperimentalFeaturesSection />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(screen.getByText("experimental.toggleHintOff")).toBeTruthy();
  });
});
