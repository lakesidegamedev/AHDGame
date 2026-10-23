// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHealPanel } from "./useHealPanel";

const endpoint = "/api/admin/heal/test";
const confirmation = "Repair these records?";
const diagnostic = { count: 2 };
const response = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const fetchMock = vi.fn();
  const confirmMock = vi.fn().mockReturnValue(true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
  const hook = renderHook(() => useHealPanel<typeof diagnostic>(endpoint, confirmation));
  return { ...hook, fetchMock, confirmMock };
}

describe("useHealPanel", () => {
  it("waits for an explicit diagnosis and keeps the previous diagnostic while loading", async () => {
    const { result, fetchMock } = setup();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ loading: false, diagnostic: null, result: null });
    fetchMock.mockResolvedValueOnce(response(diagnostic));
    await act(() => result.current.runDiagnostic());
    expect(fetchMock).toHaveBeenCalledWith(endpoint);
    expect(result.current.diagnostic).toEqual(diagnostic);

    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runDiagnostic();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.diagnostic).toEqual(diagnostic);
    await act(async () => {
      finish(response({ count: 3 }));
      await pending;
    });
    expect(result.current).toMatchObject({ loading: false, diagnostic: { count: 3 } });
  });

  it("preserves the previous diagnostic on HTTP failure and clears the error on retry", async () => {
    const { result, fetchMock } = setup();
    fetchMock
      .mockResolvedValueOnce(response(diagnostic))
      .mockResolvedValueOnce(response({ error: "Not authorized" }, false))
      .mockResolvedValueOnce(response({ count: 0 }));
    await act(() => result.current.runDiagnostic());
    await act(() => result.current.runDiagnostic());
    expect(result.current).toMatchObject({
      loading: false,
      diagnostic,
      result: { ok: false, message: "Not authorized" },
    });
    await act(() => result.current.runDiagnostic());
    expect(result.current.result).toBeNull();
    expect(result.current.diagnostic).toEqual({ count: 0 });
  });

  it("does not change state or send a POST when confirmation is cancelled", async () => {
    const { result, fetchMock, confirmMock } = setup();
    fetchMock
      .mockResolvedValueOnce(response(diagnostic))
      .mockResolvedValueOnce(response({ error: "Diagnosis refused" }, false));
    await act(() => result.current.runDiagnostic());
    await act(() => result.current.runDiagnostic());
    const before = result.current;
    confirmMock.mockReturnValue(false);
    await act(() => result.current.runHeal());
    expect(confirmMock).toHaveBeenCalledWith(confirmation);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(before);
  });

  it("clears diagnostics and prior errors before POST and releases loading when it finishes", async () => {
    const { result, fetchMock } = setup();
    fetchMock
      .mockResolvedValueOnce(response(diagnostic))
      .mockResolvedValueOnce(response({ error: "Diagnosis refused" }, false));
    await act(() => result.current.runDiagnostic());
    await act(() => result.current.runDiagnostic());
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.runHeal();
    });
    expect(result.current).toMatchObject({ loading: true, diagnostic: null, result: null });
    expect(fetchMock).toHaveBeenLastCalledWith(endpoint, { method: "POST" });
    await act(async () => {
      finish(response({ message: "Repaired" }));
      await pending;
    });
    expect(result.current).toMatchObject({
      loading: false,
      diagnostic: null,
      result: { ok: true, message: "Repaired" },
    });
  });

  it.each([
    [true, {}, "Unknown response"],
    [false, {}, "Unknown response"],
    [false, { error: "Repair refused" }, "Repair refused"],
    [false, { message: "Server message", error: "Other error" }, "Server message"],
    [true, { message: "" }, ""],
  ])("preserves repair result handling (ok=%s, body=%j)", async (ok, body, message) => {
    const { result, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(response(body, ok));
    await act(() => result.current.runHeal());
    expect(result.current.result).toEqual({ ok, message });
    expect(result.current.loading).toBe(false);
  });

  it("uses the existing diagnostic fallback when the server provides no error", async () => {
    const { result, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(response({}, false));
    await act(() => result.current.runDiagnostic());
    expect(result.current.result).toEqual({ ok: false, message: "Diagnostic failed" });
  });

  it.each(["runDiagnostic", "runHeal"] as const)(
    "keeps network and JSON failures on the existing error path for %s",
    async (operation) => {
      const { result, fetchMock } = setup();
      fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new SyntaxError("not JSON");
        },
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        await act(() => result.current[operation]());
        expect(result.current.result).toEqual({ ok: false, message: "Network error" });
        expect(result.current.loading).toBe(false);
      }
    }
  );
});
