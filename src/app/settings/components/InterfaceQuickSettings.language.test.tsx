// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterfaceQuickSettings } from "./QuickSettingsPanels";

const setLocale = vi.fn(async () => {});
const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/i18n/setLocaleAction", () => ({ setLocale: (l: string) => setLocale(l) }));
vi.mock("@/contexts/BrowserPreferencesContext", () => ({
  useBrowserPreferences: () => ({
    preferences: { reducedMotion: false, highContrast: false, language: "en" },
    updatePreferences: vi.fn(),
  }),
}));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "default" }) }));
vi.mock("@/lib/observability/fetchJson", () => ({ fetchJson: vi.fn() }));

afterEach(cleanup);

describe("InterfaceQuickSettings language", () => {
  it("offers every shipped language and switches like the Appearance panel", async () => {
    render(<InterfaceQuickSettings />);
    const select = screen.getByRole("combobox", { name: "quick.interface.language" });
    expect((select as HTMLSelectElement).disabled).toBe(false);
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      "en",
      "de",
    ]);
    fireEvent.change(select, { target: { value: "de" } });
    await waitFor(() => expect(setLocale).toHaveBeenCalledWith("de"));
    expect(refresh).toHaveBeenCalled();
  });

  it("says in place that no display-currency setting exists", () => {
    render(<InterfaceQuickSettings />);
    expect(screen.getByText("quick.interface.currencyNote")).toBeTruthy();
  });
});
