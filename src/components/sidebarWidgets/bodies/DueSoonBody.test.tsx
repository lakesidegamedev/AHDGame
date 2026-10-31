// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en/nav.json";
import type { DueSoonWidgetData } from "@/lib/sidebarWidgets/dueSoon/types";
import { DueSoonBody, dueSoonRemaining } from "./DueSoonBody";
import { widgetBadge } from "../SidebarWidget";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

const d = en.nav.widgets.dueSoon;

function renderBody(data: DueSoonWidgetData, compact = false) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DueSoonBody data={data} compact={compact} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

const data: DueSoonWidgetData = {
  currentTurn: 100,
  asOf: "2026-01-01T00:00:00.000Z",
  total: 9,
  items: [
    {
      kind: "billSign",
      id: "sign:1",
      subject: "Roads Act",
      href: "/congress/bills/1",
      dueTurn: 101,
      dueAt: null,
    },
    {
      kind: "partyElection",
      id: "partyElection:3",
      subject: "Union Party",
      position: "viceChair",
      href: "/country/us/parties/4",
      dueTurn: 103,
      dueAt: null,
    },
    {
      kind: "billVote",
      id: "bill:2",
      subject: "Schools Act",
      href: "/congress/bills/2",
      dueTurn: 104,
      dueAt: null,
    },
  ],
};

describe("DueSoonBody", () => {
  it("lists each item with its action, a link and a countdown, and counts the rest", () => {
    renderBody(data);
    const sign = screen.getByRole("link", { name: /Roads Act/ });
    expect(sign.getAttribute("href")).toBe("/congress/bills/1");
    expect(sign.textContent).toContain(d.kinds.billSign);
    expect(sign.textContent).toContain("Closes next turn");
    expect(screen.getByRole("link", { name: /Schools Act/ }).textContent).toContain("4 turns left");
    expect(screen.getByRole("link", { name: /Union Party/ }).textContent).toContain(
      `${d.kinds.partyElection} · ${d.positions.viceChair}`
    );
    expect(screen.getByText("6 more waiting")).toBeTruthy();
  });

  it("counts hours from when the list was built for dated deadlines", () => {
    renderBody({
      ...data,
      total: 1,
      items: [
        {
          kind: "stateBillSign",
          id: "stateBill:9",
          subject: "Fees",
          href: "/country/us/region/oh/legislature/bills/9",
          dueTurn: null,
          dueAt: "2026-01-01T05:30:00.000Z",
        },
      ],
    });
    expect(screen.getByRole("link", { name: /Fees/ }).textContent).toContain("5 hours left");
  });

  it("shows a calm line when nothing is waiting", () => {
    renderBody({ currentTurn: 1, asOf: data.asOf, total: 0, items: [] });
    expect(screen.getByText(d.empty)).toBeTruthy();
  });

  it("puts the total on the closed tray rail", () => {
    expect(widgetBadge("dueSoon", data)).toBe(9);
    expect(widgetBadge("dueSoon", null)).toBe(0);
  });
});

describe("dueSoonRemaining", () => {
  it("counts turns for turn deadlines and hours for dated ones", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(dueSoonRemaining({ dueTurn: 12, dueAt: null }, 10, now)).toEqual({
      unit: "turns",
      count: 2,
    });
    expect(dueSoonRemaining({ dueTurn: null, dueAt: "2026-01-01T05:30:00Z" }, 10, now)).toEqual({
      unit: "hours",
      count: 5,
    });
    expect(dueSoonRemaining({ dueTurn: null, dueAt: null }, 10, now)).toBeNull();
  });
});
