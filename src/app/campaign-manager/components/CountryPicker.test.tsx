// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { RegisteredCountriesProvider } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countries";
import { CountryPicker } from "./CountryPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

function renderPicker(current: string) {
  renderWithElectionsMessages(
    <RegisteredCountriesProvider
      value={{
        registered: ["US", "UK", "JP"] as CountryId[],
        enabled: ["US", "UK", "JP"] as CountryId[],
        preset: "1991-default",
        nameOverrides: {},
      }}
    >
      <CountryPicker countryId={current} />
    </RegisteredCountriesProvider>
  );
}

describe("CountryPicker", () => {
  it("lists the playable countries with the one on screen selected", () => {
    renderPicker("US");
    const select = screen.getByRole("combobox", { name: "Country" }) as HTMLSelectElement;
    expect(select.value).toBe("US");
    expect([...select.options].map((o) => o.value)).toEqual(["US", "UK", "JP"]);
  });

  it("opens Campaign Manager on the chosen country", () => {
    renderPicker("US");
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), {
      target: { value: "UK" },
    });
    expect(push).toHaveBeenCalledWith("/campaign-manager?country=UK");
  });
});
