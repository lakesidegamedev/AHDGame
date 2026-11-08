/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/parties.json";
import { BillWhipPanel } from "./BillWhipPanel";

const showToast = vi.fn();
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bill whip audience", () => {
  it.each(["character", "npp"])("submits the appropriate mode for %s", async (audience) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ message: "Whip issued" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <BillWhipPanel
          billId="bill-id"
          countryId="US"
          status="active"
          onWhipIssued={vi.fn()}
          whipPanel={{
            party: { id: "1", name: "Party", color: "#123456" },
            chambers: [
              {
                chamberKey: "house",
                chamberLabel: "House",
                playerWhip: { existingWhips: [], canWhip: true },
                nppWhip: { existingWhips: [], canWhip: true },
              },
            ],
          }}
        />
      </NextIntlClientProvider>
    );
    if (audience === "npp") fireEvent.click(screen.getByRole("tab", { name: "NPP whip" }));
    fireEvent.click(screen.getByRole("button", { name: "Whip FOR" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      audience,
      targetType: "bill",
      mode: audience === "character" ? "soft" : "hard",
    });
  });
});
