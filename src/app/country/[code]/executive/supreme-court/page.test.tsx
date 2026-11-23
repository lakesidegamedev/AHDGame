import { describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./SupremeCourtClient", () => ({ default: () => null }));

describe("supreme court page", () => {
  it("has no page for a country without a modeled court", async () => {
    const { default: Page } = await import("./page");
    await expect(Page({ params: Promise.resolve({ code: "ca" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("renders for the United States", async () => {
    notFound.mockClear();
    const { default: Page } = await import("./page");
    await Page({ params: Promise.resolve({ code: "us" }) });
    expect(notFound).not.toHaveBeenCalled();
  });
});
