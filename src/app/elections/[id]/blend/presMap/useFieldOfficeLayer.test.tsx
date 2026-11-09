/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useFieldOfficeLayer } from "./useFieldOfficeLayer";

const view = (selectedRegionId: string, offices = 0) => ({
  enabled: true,
  canManage: true,
  raceActive: true,
  rampTurns: 4,
  regions: [{ id: "OH", name: "Ohio", officeCount: offices, effectPct: 0 }],
  offices: [],
  selectedRegionId,
  map: { regionId: selectedRegionId, viewBox: "0 0 1 1", subdivisions: [] },
});

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return ok({ success: true });
    if (init?.method === "DELETE") return ok({ success: true });
    return ok({ fieldOffices: view(url.includes("region=PA") ? "PA" : "OH") });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFieldOfficeLayer", () => {
  it("does nothing without a campaign", () => {
    const { result } = renderHook(() => useFieldOfficeLayer(null, "OH"));
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the summary alone until a state is wanted", async () => {
    const config = { campaignId: "c1", onChanged: vi.fn() };
    const { result, rerender } = renderHook(({ region }) => useFieldOfficeLayer(config, region), {
      initialProps: { region: null as string | null },
    });
    await waitFor(() => expect(result.current?.meta?.enabled).toBe(true));
    expect(result.current?.regionView).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/c1/field-offices");

    rerender({ region: "PA" });
    await waitFor(() => expect(result.current?.regionView?.map?.regionId).toBe("PA"));
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/c1/field-offices?region=PA");
  });

  it("keeps the picked county to the state it was picked in", async () => {
    const config = { campaignId: "c1", onChanged: vi.fn() };
    const { result, rerender } = renderHook(({ region }) => useFieldOfficeLayer(config, region), {
      initialProps: { region: "OH" as string | null },
    });
    await waitFor(() => expect(result.current?.regionView).not.toBeNull());
    act(() => result.current?.selectCounty("39035"));
    expect(result.current?.selectedCounty).toBe("39035");
    rerender({ region: "PA" });
    expect(result.current?.selectedCounty).toBeNull();
  });

  it("opens an office, tells the page, and reloads", async () => {
    const onChanged = vi.fn();
    const config = { campaignId: "c1", onChanged };
    const { result } = renderHook(() => useFieldOfficeLayer(config, "OH"));
    await waitFor(() => expect(result.current?.regionView).not.toBeNull());
    const loads = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current?.openOffice("OH", "39035", "Cuyahoga County");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/campaigns/c1/field-offices",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ regionId: "OH", subdivisionId: "39035" }),
      })
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current?.message?.ok).toBe(true);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(loads + 1));
  });

  it("reports a refused open without telling the page", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: "No funds" }),
          } as Response)
        : ok({ fieldOffices: view("OH") })
    );
    const onChanged = vi.fn();
    const { result } = renderHook(() => useFieldOfficeLayer({ campaignId: "c1", onChanged }, "OH"));
    await waitFor(() => expect(result.current?.regionView).not.toBeNull());
    await act(async () => {
      await result.current?.openOffice("OH", "39035", "Cuyahoga County");
    });
    expect(result.current?.message?.ok).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("reloads when the campaign's office count changes elsewhere", async () => {
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(
      ({ version }) => useFieldOfficeLayer({ campaignId: "c1", onChanged, version }, "OH"),
      { initialProps: { version: 0 } }
    );
    await waitFor(() => expect(result.current?.regionView).not.toBeNull());
    const loads = fetchMock.mock.calls.length;
    rerender({ version: 1 });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(loads + 1));
  });
});
