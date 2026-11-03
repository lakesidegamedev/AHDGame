import { describe, expect, it, vi } from "vitest";
import { askQuestion } from "./askDrawerApi";
import { findFinishedAnswer, recoverFinishedAnswer } from "./askRecovery";

const noSleep = () => Promise.resolve();

describe("findFinishedAnswer", () => {
  it("picks the newest saved turn for the question that is not already on screen", () => {
    const turns = [
      { question: "Why did my approval drop?", answer: "Old.", id: 1 },
      { question: "Why did my approval drop?", answer: "New.", id: 2, used_mcp: 1 },
    ];
    expect(findFinishedAnswer(turns, " Why did my approval drop? ", new Set([1]))?.answer).toBe(
      "New."
    );
    expect(findFinishedAnswer(turns, "Why did my approval drop?", new Set([1, 2]))).toBeNull();
  });

  it("ignores a turn with no answer yet", () => {
    expect(findFinishedAnswer([{ question: "Q?", answer: "" }], "Q?", new Set())).toBeNull();
  });
});

describe("recoverFinishedAnswer", () => {
  it("polls until the finished answer appears", async () => {
    const fetchConversation = vi
      .fn()
      .mockResolvedValueOnce({ turns: [{ question: "Q?", answer: "" }] })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ turns: [{ question: "Q?", answer: "Done.", id: 7 }] });
    const result = await recoverFinishedAnswer({
      convId: "c1",
      question: "Q?",
      knownAnswerIds: new Set(),
      signal: new AbortController().signal,
      fetchConversation,
      sleep: noSleep,
    });
    expect(result?.answer).toBe("Done.");
    expect(result?.answerId).toBe(7);
    expect(fetchConversation).toHaveBeenCalledTimes(3);
  });

  it("gives up after the deadline", async () => {
    let clock = 0;
    const fetchConversation = vi.fn().mockResolvedValue({ turns: [] });
    const result = await recoverFinishedAnswer({
      convId: "c1",
      question: "Q?",
      knownAnswerIds: new Set(),
      signal: new AbortController().signal,
      fetchConversation,
      sleep: () => Promise.resolve(void (clock += 3000)),
      now: () => clock,
    });
    expect(result).toBeNull();
    expect(fetchConversation).toHaveBeenCalledTimes(40);
  });

  it("stops polling when the player stops", async () => {
    const controller = new AbortController();
    const fetchConversation = vi.fn().mockResolvedValue({ turns: [] });
    const result = await recoverFinishedAnswer({
      convId: "c1",
      question: "Q?",
      knownAnswerIds: new Set(),
      signal: controller.signal,
      fetchConversation,
      sleep: () => Promise.resolve(controller.abort()),
    });
    expect(result).toBeNull();
    expect(fetchConversation).not.toHaveBeenCalled();
  });
});

function sseResponse(body: ReadableStream<Uint8Array>) {
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("askQuestion dropped streams", () => {
  const encode = (text: string) => new TextEncoder().encode(text);

  it("reports a stream that ends before done as dropped, with its conversation id", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('event: meta\ndata: {"convId":"c9"}\n\n'));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(stream)));
    const result = await askQuestion({}, new AbortController().signal, () => undefined);
    expect(result).toMatchObject({ ok: false, dropped: true, convId: "c9", payload: null });
  });

  it("reports a stream that errors mid-way as dropped", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent) return c.error(new TypeError("network error"));
        sent = true;
        c.enqueue(encode('event: meta\ndata: {"convId":"c9"}\n\n'));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(stream)));
    const result = await askQuestion({}, new AbortController().signal, () => undefined);
    expect(result).toMatchObject({ dropped: true, convId: "c9" });
  });

  it("reports a silent stream as dropped once the stall limit passes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('event: meta\ndata: {"convId":"c9"}\n\n'));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(stream)));
    const result = await askQuestion({}, new AbortController().signal, () => undefined, 20);
    expect(result).toMatchObject({ dropped: true, convId: "c9" });
  });

  it("does not call a finished stream dropped", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('event: done\ndata: {"answer":"Hi"}\n\n'));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(stream)));
    const result = await askQuestion({}, new AbortController().signal, () => undefined);
    expect(result.dropped).toBe(false);
    expect(result.payload?.answer).toBe("Hi");
  });
});
