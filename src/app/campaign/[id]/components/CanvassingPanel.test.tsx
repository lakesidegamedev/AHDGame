/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/elections.json";
import { CanvassingPanel } from "./CanvassingPanel";
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatFull: (n: number) => `₳${n}` }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps a selected category when the census preview arrives", async () => {
  let finishPreview!: (response: unknown) => void;
  const pending = new Promise((resolve) => {
    finishPreview = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/eligibility")
        ? Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, stateId: "GA", source: "home" }),
          })
        : pending
    )
  );
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CanvassingPanel countryId="US" />
    </NextIntlClientProvider>
  );
  await screen.findByRole("combobox");
  finishPreview({
    ok: true,
    json: async () => ({
      stateId: "GA",
      targets: [
        { dimension: "race", bucket: "white" },
        { dimension: "education", bucket: "college" },
      ],
      preview: null,
    }),
  });
  await screen.findByRole("option", { name: "Education" });
  const category = screen.getByRole("combobox") as HTMLSelectElement;
  fireEvent.change(category, { target: { value: "education" } });
  expect(category.value).toBe("education");
  expect([...category.options].map((option) => option.value)).not.toContain("ideology");
});

describe("country target vocabulary", () => {
  it.each(["UK", "JP", "DE", "IE", "CN", "BR", "DD"])(
    "offers only %s census buckets",
    async (countryId) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({
          ok: true,
          json: async () =>
            url.endsWith("/eligibility")
              ? { ok: true, stateId: "region", source: "home" }
              : {
                  stateId: "region",
                  targets: [{ dimension: "education", bucket: "tertiary" }],
                  preview: null,
                },
        }))
      );
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <CanvassingPanel countryId={countryId} />
        </NextIntlClientProvider>
      );
      const categories = (await screen.findAllByRole("combobox"))[0] as HTMLSelectElement;
      await waitFor(() =>
        expect([...categories.options].map((option) => option.value).filter(Boolean)).toEqual([
          "education",
        ])
      );
    }
  );
});
