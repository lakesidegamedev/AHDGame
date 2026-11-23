// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedbackPage from "./page";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/FeedbackModal", () => ({ FeedbackModal: () => null }));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("feedback board counts", () => {
  it("never shows zero counts before the real ones arrive", async () => {
    let resolveCounts: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/counts")) {
          return new Promise<Response>((resolve) => {
            resolveCounts = resolve;
          });
        }
        if (url.includes("/api/suggestions/public"))
          return Promise.resolve(Response.json({ items: [], total: 0 }));
        return Promise.resolve(Response.json({}));
      })
    );
    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getAllByLabelText("Loading count").length).toBe(6));
    expect(screen.queryByText("(0)")).toBeNull();
    resolveCounts(Response.json({ counts: { planned: 18 }, total: 451 }));
    await waitFor(() => expect(screen.getByText("(451)")).toBeTruthy());
    expect(screen.getByText("(18)")).toBeTruthy();
  });

  it("explains gaps in the numbering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ items: [], total: 0, counts: {} })))
    );
    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText(/never reused/)).toBeTruthy());
  });
});
