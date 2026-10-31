// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/nav.json";
import { KeirPetBody, timeOfDay } from "./KeirPetBody";
import type { KeirPetWidgetData } from "@/lib/sidebarWidgets/keirPetShared";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/askDrawer/KeirSprite", () => ({
  KeirSprite: ({ mood }: { mood: string }) => <span data-testid="keir" data-mood={mood} />,
}));

const k = en.nav.widgets.keirPet;
const pet: KeirPetWidgetData = {
  advice: {
    id: "a",
    title: "Spend your points",
    why: "You are near the cap.",
    link: "/actions",
    tone: "nudge",
    generatedAt: "2026-10-30T10:00:00Z",
  },
  bond: 12,
  hearts: 1,
  nextHeartAt: 30,
  streak: 3,
  teaReadyAt: null,
  patReadyAt: null,
};

function renderPet(data = pet) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <KeirPetBody data={data} compact={false} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ pet: { ...pet, bond: 13 } })))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("KeirPetBody", () => {
  it("shows today's tip with a link and the bond and streak", () => {
    renderPet();
    expect(screen.getByText("Spend your points")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Show me/ }).getAttribute("href")).toBe("/actions");
    expect(screen.getByText("3 days")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("10");
  });

  it("reacts to a pat and records it when he is ready", async () => {
    renderPet();
    fireEvent.click(screen.getAllByRole("button", { name: k.pat })[1]!);
    expect(screen.getByTestId("keir").dataset.mood).not.toBe("wave");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/sidebar-widgets/keir-pet",
        expect.objectContaining({ body: JSON.stringify({ action: "pat" }) })
      )
    );
  });

  it("holds tea until the cooldown ends", () => {
    renderPet({ ...pet, teaReadyAt: new Date(Date.now() + 90 * 60_000).toISOString() });
    const tea = screen.getByRole("button", { name: /Tea in 2h/ }) as HTMLButtonElement;
    expect(tea.disabled).toBe(true);
  });

  it("names the time of day for his room", () => {
    expect([3, 8, 14, 20, 23].map(timeOfDay)).toEqual([
      "night",
      "morning",
      "day",
      "evening",
      "night",
    ]);
  });
});
