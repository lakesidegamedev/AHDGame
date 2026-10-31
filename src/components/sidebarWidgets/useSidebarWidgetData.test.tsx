// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSidebarWidgetCache, useSidebarWidgetData } from "./useSidebarWidgetData";

const fetchMock = vi.fn();
/** The hook's background refresh period. */
const REFRESH_MS = 120_000;

beforeEach(() => {
  resetSidebarWidgetCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ data: { chamberFloor: null } }))
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSidebarWidgetData", () => {
  it("reads once without polling when asked for a one-off check", async () => {
    const intervals = vi.spyOn(window, "setInterval");
    const { result } = renderHook(() => useSidebarWidgetData(["chamberFloor"], { poll: false }));
    await waitFor(() => expect(result.current.loaded("chamberFloor")).toBe(true));
    expect(result.current.data.chamberFloor).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(intervals).not.toHaveBeenCalledWith(expect.any(Function), REFRESH_MS);
  });

  it("polls by default", async () => {
    const intervals = vi.spyOn(window, "setInterval");
    renderHook(() => useSidebarWidgetData(["chamberFloor"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(intervals).toHaveBeenCalledWith(expect.any(Function), REFRESH_MS);
  });
});
