// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AskActionCard } from "./AskActionCard";
import type { AskProposedAction } from "./askDrawerApi";

const draft: AskProposedAction = {
  id: "act_1234567890abcdef",
  kind: "suggestion",
  title: "Show union support by state",
  description: "A map of union support would help plan organising.",
  category: "feature_request",
  gameSystem: "parties",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AskActionCard", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the draft for editing and sends the edits", async () => {
    fetchMock.mockResolvedValue(
      json(200, { ok: true, receipt: { kind: "suggestion", number: 123 } })
    );
    const onFiled = vi.fn();
    render(<AskActionCard action={draft} onFiled={onFiled} />);

    expect(screen.getByText("Suggestion")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Union support map" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const link = await screen.findByRole("link", { name: "Suggestion #123" });
    expect(link.getAttribute("href")).toBe("/feedback/123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ask-drawer/action/confirm");
    expect(JSON.parse(init.body)).toEqual({
      actionId: draft.id,
      title: "Union support map",
      description: draft.description,
    });
    expect(onFiled).toHaveBeenCalledWith({ kind: "suggestion", number: 123 });
  });

  it("treats an already-filed draft as filed", async () => {
    fetchMock.mockResolvedValue(json(409, { receipt: { kind: "suggestion", number: 99 } }));
    render(<AskActionCard action={draft} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("link", { name: "Suggestion #99" })).toBeTruthy();
  });

  it("shows a ticket receipt with its Discord link", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        ok: true,
        receipt: { kind: "ticket", number: 456, url: "https://discord.com/channels/1/2" },
      })
    );
    render(<AskActionCard action={{ ...draft, kind: "ticket", category: "bug" }} />);
    expect(screen.getByText("Support ticket")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const link = await screen.findByRole("link", { name: "Ticket #456" });
    expect(link.getAttribute("href")).toBe("https://discord.com/channels/1/2");
  });

  it("points to Discord linking when a ticket needs it", async () => {
    fetchMock.mockResolvedValue(
      json(422, { error: "Link your Discord account to open a ticket.", needsDiscordLink: true })
    );
    render(<AskActionCard action={{ ...draft, kind: "ticket" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Link your Discord account/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Connect Discord in settings" }).getAttribute("href")
    ).toBe("/settings?section=identity");
    // The draft stays so the player can send it after linking.
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("cancels without filing", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    render(<AskActionCard action={draft} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Not filed.")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ask-drawer/action/cancel");
  });

  it("will not send an expired draft", async () => {
    render(<AskActionCard action={{ ...draft, expiresAt: Date.now() - 1000 }} />);
    expect(await screen.findByText(/This draft expired/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
