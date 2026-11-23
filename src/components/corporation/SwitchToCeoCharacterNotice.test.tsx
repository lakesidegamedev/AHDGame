// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SwitchToCeoCharacterNotice } from "./SwitchToCeoCharacterNotice";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("names the sibling character and switches to it on click", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    writable: true,
  });
  render(<SwitchToCeoCharacterNotice characterId="abc" characterName="Sibling" />);
  expect(screen.getByTestId("switch-to-ceo-line").textContent).toBe(
    "Your character Sibling runs this corporation. Switch character to manage it."
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch character" }));
  await waitFor(() => expect(reload).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/auth/active-character",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ characterId: "abc" }) })
  );
});
