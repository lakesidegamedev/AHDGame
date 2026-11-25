/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useInboxData } from "./useInboxData";
import { InboxClient } from "./InboxClient";
import type { InboxItem } from "@/lib/inbox";

vi.mock("./useInboxData", () => ({ INBOX_NOTIFICATION_LIMIT: 100, useInboxData: vi.fn() }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => ({ currentTurn: 12 }) }));

let mockSearch = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const mockUseInboxData = vi.mocked(useInboxData);

function notif(id: string): InboxItem {
  return {
    id,
    kind: "notif",
    category: "crisis",
    label: "Crisis",
    urgency: "urgent",
    unread: true,
    action: true,
    createdAt: new Date().toISOString(),
    time: "now",
    title: `Title ${id}`,
    body: `Body ${id}`,
  };
}

function hookResult(items: InboxItem[], refetch: () => void) {
  return {
    items,
    loading: false,
    error: null as string | null,
    refetch,
    counts: {
      all: items.filter((i) => i.unread).length,
      notifs: items.filter((i) => i.kind === "notif" && i.unread).length,
      mail: 0,
      action: items.filter((i) => i.action && i.unread).length,
    },
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => ResponseLike) {
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    return handler(url, init) as unknown as Response;
  }) as unknown as typeof fetch;
}

type ResponseLike = { ok: boolean; status: number; json: () => Promise<unknown> };

const okJson = (body: unknown): ResponseLike => ({
  ok: true,
  status: 200,
  json: async () => body,
});

it("keeps the inbox heading and tab row in place while the data loads", () => {
  mockUseInboxData.mockReturnValue({ ...hookResult([], vi.fn()), loading: true });
  render(<InboxClient />);
  expect(screen.getByRole("heading", { name: "Inbox" })).toBeTruthy();
  expect(screen.getByRole("tablist", { name: "Inbox segment" })).toBeTruthy();
});

it("groups matching notifications while keeping different event links separate", () => {
  const first = {
    ...notif("first"),
    source: { label: "View event", href: "/events/first" },
    meta: [["Turn", "10"]] as [string, string][],
  };
  const repeated = { ...first, id: "repeat", meta: [["Turn", "11"]] as [string, string][] };
  const other = { ...first, id: "other", source: { ...first.source, href: "/events/other" } };
  mockUseInboxData.mockReturnValue(hookResult([first, repeated, other], vi.fn()));

  const { container } = render(<InboxClient />);

  expect(container.querySelectorAll("details")).toHaveLength(1);
  expect(container.querySelector("summary")?.textContent).toContain("2 notifications");
  expect(container.querySelectorAll("details button[aria-label^=Archive]")).toHaveLength(2);
});

it("puts crisis starts and ends for the same crisis in one group across time sections", () => {
  const source = { label: "View crisis", href: "/world/crises/one" };
  const ended = { ...notif("ended"), type: "crisis_resolved" as const, source };
  const started = { ...notif("started"), type: "crisis" as const, source, time: "1d" };
  mockUseInboxData.mockReturnValue(hookResult([ended, started], vi.fn()));

  const { container } = render(<InboxClient />);

  expect(container.querySelector("summary")?.textContent).toContain("2 notifications");
  expect(container.querySelectorAll("details button[aria-label^=Archive]")).toHaveLength(2);
});

it("uses recorded turns even when relative ages disagree", () => {
  mockUseInboxData.mockReturnValue(
    hookResult(
      [
        { ...notif("old"), turn: "11" },
        { ...notif("current"), turn: "12", time: "1d" },
      ],
      vi.fn()
    )
  );
  render(<InboxClient />);

  expect(screen.getByText("This turn · 12")).toBeTruthy();
  expect(screen.getByText("Turn 12 · 1d")).toBeTruthy();
  expect(screen.getByText("Earlier and unlabelled turns")).toBeTruthy();
  expect(screen.getByText("Turn 11 · now")).toBeTruthy();
});

it("archives a notification from the rail without opening it", async () => {
  mockUseInboxData.mockReturnValue(hookResult([notif("first"), notif("second")], vi.fn()));
  mockFetch(() => okJson({ success: true }));
  render(<InboxClient />);

  fireEvent.click(screen.getByRole("button", { name: "Archive Title second" }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({ body: JSON.stringify({ id: "second", action: "archive" }) })
    );
  });
  expect(screen.queryByRole("button", { name: "Archive Title second" })).toBeNull();
});

describe("InboxClient handleMarkAllRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const patchCalls = () =>
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "PATCH"
    );

  function mail(id: string, mailId: string): InboxItem {
    return {
      ...notif(id),
      kind: "mail",
      messages: [{ id: mailId, from: "them", time: new Date().toISOString(), body: "hello" }],
    };
  }

  it("success: marks a long unread list read in one request, with no error", async () => {
    const refetch = vi.fn();
    const items = Array.from({ length: 27 }, (_, i) => notif(`n${i}`));
    mockUseInboxData.mockReturnValue(hookResult(items, refetch));
    mockFetch((url, init) => {
      if (url === "/api/notifications" && init?.method === "PATCH") {
        return okJson({ success: true });
      }
      return okJson(null);
    });

    render(<InboxClient />);

    const button = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(button);

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [url, init] = patchCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/notifications");
    expect(JSON.parse(String(init.body))).toEqual({ ids: items.map((i) => i.id) });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/0 items need/);
    });
  });

  it("failure: shows an error, rolls back to unread, and refetches server state", async () => {
    const refetch = vi.fn();
    mockUseInboxData.mockReturnValue(hookResult([notif("n1"), notif("n2")], refetch));
    mockFetch((url, init) => {
      if (url === "/api/notifications" && init?.method === "PATCH") {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return okJson(null);
    });

    render(<InboxClient />);

    const button = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't mark everything as read/);

    // Optimistic readIds were rolled back: the unread count returns.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/2 items need/);
    });
    expect(refetch).toHaveBeenCalled();
  });

  it("partial failure: notifications saved, mail refused, only mail rolls back", async () => {
    const refetch = vi.fn();
    mockUseInboxData.mockReturnValue(
      hookResult([notif("n1"), notif("n2"), mail("t1", "m1")], refetch)
    );
    mockFetch((url, init) => {
      if (url === "/api/notifications" && init?.method === "PATCH") {
        return okJson({ success: true });
      }
      if (url === "/api/mail" && init?.method === "PATCH") {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return okJson(null);
    });

    render(<InboxClient />);

    const button = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Some items couldn't be marked as read/);
    expect(patchCalls()).toHaveLength(2);
    expect(refetch).toHaveBeenCalled();
  });

  it("rate limited: tells the player to wait instead of reporting a generic failure", async () => {
    const refetch = vi.fn();
    mockUseInboxData.mockReturnValue(hookResult([notif("n1"), notif("n2")], refetch));
    global.fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "45" }),
          json: async () => ({}),
        }) as unknown as Response
    ) as unknown as typeof fetch;

    render(<InboxClient />);

    const button = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Too many requests/);
    // A long Retry-After is reported, not waited out or hammered.
    expect(patchCalls()).toHaveLength(1);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/2 items need/);
    });
  });
});

describe("InboxClient bell deep link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(() => okJson({ success: true }));
  });

  afterEach(() => {
    mockSearch = "";
    vi.restoreAllMocks();
  });

  const readOld = (id: string): InboxItem => ({ ...notif(id), unread: false, action: false });

  it("opens the Mail tab from the header link without marking any message read", () => {
    mockSearch = "tab=mail";
    mockUseInboxData.mockReturnValue(
      hookResult([notif("n1"), { ...notif("thread"), kind: "mail", messages: [] }], vi.fn())
    );

    render(<InboxClient />);

    expect(screen.getByRole("tab", { name: /^Mail/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Title n1")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("selects the notification named by ?id even when it is outside the default view", async () => {
    mockSearch = "id=n3";
    mockUseInboxData.mockReturnValue(
      hookResult([notif("n1"), notif("n2"), readOld("n3")], vi.fn())
    );

    render(<InboxClient />);

    await waitFor(() => {
      const current = document.querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain("Title n3");
    });
  });

  it("marks an unread deep-linked notification read", async () => {
    mockSearch = "id=n2";
    mockUseInboxData.mockReturnValue(hookResult([notif("n1"), notif("n2")], vi.fn()));

    render(<InboxClient />);

    await waitFor(() => {
      const current = document.querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain("Title n2");
    });
    await waitFor(() => {
      const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some((c) => String((c[1] as RequestInit | undefined)?.body).includes('"id":"n2"'))
      ).toBe(true);
    });
  });

  it("falls back to the default selection when the id is unknown", async () => {
    mockSearch = "id=missing";
    mockUseInboxData.mockReturnValue(hookResult([notif("n1"), notif("n2")], vi.fn()));

    render(<InboxClient />);

    await waitFor(() => {
      const current = document.querySelector('[aria-current="true"]');
      expect(current?.textContent).toContain("Title n1");
    });
  });
});

describe("InboxClient selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(() => okJson({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the opened item selected and visible in Needs action with more than 24 unread", async () => {
    const items = Array.from({ length: 30 }, (_, i) => notif(`n${i + 1}`));
    mockUseInboxData.mockReturnValue(hookResult(items, vi.fn()));

    render(<InboxClient />);

    fireEvent.click(await screen.findByRole("tab", { name: /Needs action/ }));
    fireEvent.click(await screen.findByText("Title n5"));

    await waitFor(() => {
      expect(
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
          String((c[1] as RequestInit | undefined)?.body).includes('"id":"n5"')
        )
      ).toBe(true);
    });
    const current = document.querySelector('[aria-current="true"]');
    expect(current?.textContent).toContain("Title n5");
  });

  it("keeps the opened item in the All view when it ranks inside the first 24", async () => {
    const items = Array.from({ length: 30 }, (_, i) => notif(`n${i + 1}`));
    mockUseInboxData.mockReturnValue(hookResult(items, vi.fn()));

    render(<InboxClient />);

    fireEvent.click(await screen.findByText("Title n5"));
    await waitFor(() => {
      expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Title n5");
    });
  });
});
