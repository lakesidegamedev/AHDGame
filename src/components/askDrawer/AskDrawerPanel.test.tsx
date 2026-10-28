// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AskAnswerPayload, AskStreamEvent } from "./askDrawerApi";

const api = vi.hoisted(() => ({
  emit: null as null | ((event: AskStreamEvent) => void),
  finish: null as null | ((payload: AskAnswerPayload) => void),
  suggest: vi.fn(),
  askQuestion: null as null | ReturnType<typeof vi.fn>,
}));

vi.mock("./askDrawerApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./askDrawerApi")>();
  return {
    ...actual,
    askJson: vi.fn(() => Promise.resolve({ usage: null })),
    suggestQuestions: api.suggest,
    askQuestion: (api.askQuestion = vi.fn(
      (_body: unknown, _signal: AbortSignal, onEvent: (event: AskStreamEvent) => void) =>
        new Promise((resolve) => {
          api.emit = onEvent;
          api.finish = (payload) => resolve({ ok: true, status: 200, payload });
        })
    )),
  };
});

import { AskDrawerPanel } from "./AskDrawerPanel";

function renderPanel() {
  return render(
    <AskDrawerPanel side="right" onClose={() => undefined} onSwapSide={() => undefined} />
  );
}

async function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  });
}

describe("AskDrawerPanel", () => {
  beforeEach(() => {
    vi.useRealTimers();
    api.emit = null;
    api.finish = null;
    api.suggest.mockReset();
    api.suggest.mockResolvedValue({ questions: [] });
  });

  it("is no longer labelled experimental", () => {
    renderPanel();
    expect(screen.queryByText("Experimental")).toBeNull();
  });

  it("shows the ack first, the research steps live, then the answer", async () => {
    renderPanel();
    await ask("How do I build union support?");

    act(() =>
      api.emit?.({
        event: "ack",
        data: { text: "I'll look into how to build union support for you." },
      })
    );
    expect(screen.getByText("I'll look into how to build union support for you.")).toBeTruthy();

    act(() =>
      api.emit?.({ event: "status", data: { label: "Searching the wiki", phase: "search" } })
    );
    act(() =>
      api.emit?.({ event: "status", data: { label: "Reading the union code", phase: "read" } })
    );
    expect(screen.getByText("Searching the wiki")).toBeTruthy();
    expect(screen.getByText("Reading the union code")).toBeTruthy();
    expect(document.querySelector("[data-keir-mood]")?.getAttribute("data-keir-mood")).toBe(
      "reading"
    );

    act(() => api.emit?.({ event: "delta", data: "Join a union and " }));
    expect(document.querySelector("[data-keir-alert]")).toBeTruthy();
    expect(document.querySelector("[data-keir-mood]")?.getAttribute("data-keir-mood")).toBe(
      "alert"
    );

    await act(async () => {
      api.finish?.({ answer: "Join a union and organise.", followups: [] });
    });
    expect(screen.getByText("Join a union and organise.")).toBeTruthy();
    // The ack stays as Keir's first line above the answer.
    expect(screen.getByText("I'll look into how to build union support for you.")).toBeTruthy();
    expect(document.querySelector("[data-keir-alert]")).toBeNull();
  });

  it("shows a drafted action as a confirm card", async () => {
    renderPanel();
    await ask("File this as a suggestion");
    await act(async () => {
      api.finish?.({
        answer: "I can file this as a suggestion. Here's the draft. Send it?",
        proposedAction: {
          id: "act_1234567890abcdef",
          kind: "suggestion",
          title: "Union support map",
          description: "Show union support by state.",
        },
      });
    });
    expect(screen.getByRole("region", { name: "Suggestion draft" })).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Union support map");
  });

  it("always reads live data, with no toggle, and shows what the answer cost", async () => {
    renderPanel();
    expect(screen.queryByText("Code + live data")).toBeNull();
    expect(screen.queryByText("Code only")).toBeNull();
    await ask("Why did my approval drop?");
    expect(api.askQuestion?.mock.calls[0][0]).toMatchObject({ useMcp: true });
    await act(async () => {
      api.finish?.({
        answer: "Your party lost a vote.",
        usedMcp: true,
        charge: { cost: 0.6, percentOfDaily: 3, reasons: ["live data", "chart"] },
      });
    });
    expect(screen.getByText("Used 3% of today's energy (live data, chart)")).toBeTruthy();
  });

  it("says a stopped answer used no energy", async () => {
    renderPanel();
    await ask("Why did my approval drop?");
    await act(async () => {
      api.finish?.({ stopped: true });
    });
    expect(screen.getByText("Stopped. This did not use any energy.")).toBeTruthy();
  });

  it("offers page-aware starter questions once they arrive", async () => {
    vi.useFakeTimers();
    api.suggest.mockResolvedValue({
      questions: [
        "How do I build union support in my state?",
        "What does union membership change?",
        "Who leads the biggest union here?",
      ],
      source: "page",
    });
    renderPanel();
    // The static starters show while the suggestions load.
    expect(screen.getByText("Explain what I'm looking at")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.suggest).toHaveBeenCalledTimes(1);
    expect(screen.getByText("How do I build union support in my state?")).toBeTruthy();
    expect(screen.queryByText("Explain what I'm looking at")).toBeNull();
    vi.useRealTimers();
  });
});
