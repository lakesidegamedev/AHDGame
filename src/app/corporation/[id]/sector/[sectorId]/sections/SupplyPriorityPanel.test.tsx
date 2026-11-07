// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SupplyPriorityPanel from "./SupplyPriorityPanel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => vi.unstubAllGlobals());

describe("SupplyPriorityPanel", () => {
  it("posts the new value and shows the switch on", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<SupplyPriorityPanel corporationId="c" sectorId="s" sellOutsideFirst={false} />);
    const sw = screen.getByRole("switch");
    expect((sw as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sw);
    await waitFor(() =>
      expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true)
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/api/corporations/c/sectors/s/supply-priority");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sellOutsideFirst: true });
  });

  it("keeps the switch off and shows an alert when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ error: "Not allowed" }) })
    );
    render(<SupplyPriorityPanel corporationId="c" sectorId="s" sellOutsideFirst={false} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
  });
});
