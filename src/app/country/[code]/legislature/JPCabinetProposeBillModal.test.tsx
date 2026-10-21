/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../messages/en/layout.json";

const mocks = vi.hoisted(() => ({
  getWorldFlags: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/hooks/useWorldFlags", () => ({ useWorldFlags: mocks.getWorldFlags }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/components/legislation/GuidedLegislationModal", () => ({
  GuidedLegislationModal: (props: { canSubmit?: boolean; hasActiveBill?: boolean }) => (
    <div
      data-testid="guided-modal"
      data-can-submit={String(Boolean(props.canSubmit))}
      data-active-bill={String(Boolean(props.hasActiveBill))}
    />
  ),
}));

import { JPCabinetProposeBillModal } from "./JPCabinetProposeBillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.getWorldFlags.mockReturnValue({
    loaded: true,
    failed: false,
    resetSystemVersions: { legislation: "v1" },
    resetV2Countries: [],
  });
});

describe("JPCabinetProposeBillModal", () => {
  beforeEach(() => {
    mocks.getWorldFlags.mockReturnValue({
      loaded: true,
      failed: false,
      resetSystemVersions: { legislation: "v1" },
      resetV2Countries: [],
    });
  });

  it("allows a legacy cabinet draft during an active bill but guards submission", () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <JPCabinetProposeBillModal
          countryId="JP"
          canSubmit={false}
          hasActiveBill
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(/You already have a bill in progress/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Propose bill" }).hasAttribute("disabled")).toBe(
      true
    );
    fireEvent.submit(document.querySelector("form")!);
    expect(mocks.showToast).toHaveBeenCalledWith(
      "You already have a bill in progress. You can prepare this draft, but must wait for that bill to resolve before proposing another.",
      "error"
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("passes the active-bill submission lock through to the v2 drafting modal", () => {
    mocks.getWorldFlags.mockReturnValue({
      loaded: true,
      failed: false,
      resetSystemVersions: { legislation: "v2" },
      resetV2Countries: ["JP"],
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <JPCabinetProposeBillModal
          countryId="JP"
          canSubmit={false}
          hasActiveBill
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByTestId("guided-modal").dataset.canSubmit).toBe("false");
    expect(screen.getByTestId("guided-modal").dataset.activeBill).toBe("true");
  });
});
