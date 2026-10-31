/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/layout.json";
import { QueueBillModal } from "./QueueBillModal";

const mocks = vi.hoisted(() => ({ guided: vi.fn() }));

vi.mock("@/hooks/useWorldFlags", () => ({
  useWorldFlags: () => {
    throw new Error("The office composer must use its server-resolved version");
  },
}));
vi.mock("@/components/legislation/GuidedLegislationModal", () => ({
  GuidedLegislationModal: (props: unknown) => {
    mocks.guided(props);
    return <div>Guided regional composer</div>;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderComposer(props: Parameters<typeof QueueBillModal>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueueBillModal {...props} />
    </NextIntlClientProvider>
  );
}

describe("Governor queue composer", () => {
  const props = {
    open: true,
    legislationVersion: "v2" as const,
    countryId: "uk",
    stateId: "sco",
    eligibleNpps: [{ _id: "npp-1", name: "Party legislator" }],
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  it("opens the v2 regional composer from the Scotland governor office", () => {
    renderComposer(props);
    expect(screen.getByText("Guided regional composer")).toBeTruthy();
    expect(mocks.guided).toHaveBeenCalledWith(
      expect.objectContaining({
        countryId: "UK",
        regionId: "SCO",
        scope: "regional",
        endpoint: "/api/country/uk/region/sco/office/legislation/queue",
        queue: { eligibleNpps: props.eligibleNpps },
      })
    );
    expect(screen.queryByLabelText("Proposing NPP")).toBeNull();
  });

  it("explains when there is no eligible party legislator", () => {
    renderComposer({ ...props, eligibleNpps: [] });
    expect(screen.getByRole("heading", { name: "No eligible NPPs" })).toBeTruthy();
    expect(mocks.guided).not.toHaveBeenCalled();
  });

  it("retains the legacy composer for a server-resolved v1 country", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    renderComposer({ ...props, legislationVersion: "v1" });
    await waitFor(() => expect(screen.getByText("Proposing NPP")).toBeTruthy());
    expect(mocks.guided).not.toHaveBeenCalled();
  });

  it("does not mount a composer while closed", () => {
    renderComposer({ ...props, open: false });
    expect(mocks.guided).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
