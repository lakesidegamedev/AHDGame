// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  askQuestion: vi.fn(),
  recover: vi.fn(),
}));

vi.mock("./askDrawerApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./askDrawerApi")>();
  return {
    ...actual,
    askJson: vi.fn(() => Promise.resolve({ usage: null })),
    suggestQuestions: vi.fn(() => Promise.resolve({ questions: [] })),
    askQuestion: mocks.askQuestion,
  };
});
vi.mock("./askRecovery", () => ({ recoverFinishedAnswer: mocks.recover }));

import { AskDrawerPanel } from "./AskDrawerPanel";

async function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  });
}

const dropped = { ok: false, status: 200, payload: null, dropped: true, convId: "c1" };

describe("AskDrawerPanel dropped stream", () => {
  beforeEach(() => {
    mocks.askQuestion.mockReset();
    mocks.recover.mockReset();
  });

  it("shows Reconnecting... then the recovered answer", async () => {
    let finishRecovery: (v: unknown) => void = () => undefined;
    mocks.askQuestion.mockResolvedValue(dropped);
    mocks.recover.mockReturnValue(new Promise((resolve) => (finishRecovery = resolve)));
    render(<AskDrawerPanel side="right" onClose={() => undefined} onSwapSide={() => undefined} />);
    await ask("How do I build union support?");
    expect(screen.getByText("Reconnecting...")).toBeTruthy();
    await act(async () => finishRecovery({ answer: "Organise a strike fund.", answerId: 4 }));
    expect(screen.getByText("Organise a strike fund.")).toBeTruthy();
    expect(screen.queryByText("Reconnecting...")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows a plain error and Retry when the answer never appears", async () => {
    mocks.askQuestion.mockResolvedValueOnce(dropped);
    mocks.recover.mockResolvedValue(null);
    render(<AskDrawerPanel side="right" onClose={() => undefined} onSwapSide={() => undefined} />);
    await ask("How do I build union support?");
    expect(screen.getByText("Ask lost the connection before that answer finished.")).toBeTruthy();
    mocks.askQuestion.mockResolvedValueOnce({
      ok: true,
      status: 200,
      payload: { answer: "Second try worked." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(screen.getByText("Second try worked.")).toBeTruthy();
    expect(screen.getAllByText("How do I build union support?")).toHaveLength(1);
  });
});

describe("AskDrawerPanel answer length", () => {
  it("sends the chosen length with the question", async () => {
    mocks.askQuestion.mockReset();
    mocks.askQuestion.mockResolvedValue({ ok: true, status: 200, payload: { answer: "Short." } });
    localStorage.clear();
    render(<AskDrawerPanel side="right" onClose={() => undefined} onSwapSide={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Answer length"), { target: { value: "concise" } });
    await ask("How do I build union support?");
    expect(mocks.askQuestion.mock.calls[0][0]).toMatchObject({ length: "concise" });
  });
});
