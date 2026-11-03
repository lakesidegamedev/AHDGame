// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AccountSection } from "./AccountSection";
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string) =>
        ({
          linkDiscord: "Link Discord",
          discordRequired: "(Required)",
          optional: "(optional)",
          discordRequiredHint: "Required before creating a character",
          discordOptionalHint: "Optional Discord linking",
        })[key] ?? key,
      { rich: (key: string) => key }
    ),
}));
afterEach(cleanup);
const formData = {
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  adminKey: "",
  referralCode: "",
  testSecret: "",
};
describe("registration Discord linking", () => {
  it("labels optional linking and lets the player opt in", () => {
    const change = vi.fn();
    render(
      <AccountSection
        formData={formData}
        onChange={() => {}}
        onSocialRegister={() => {}}
        onLinkDiscordChange={change}
      />
    );
    const checkbox = screen.getByRole("checkbox", { name: /Link Discord/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    expect(screen.getByText("Optional Discord linking")).toBeTruthy();
    fireEvent.click(checkbox);
    expect(change).toHaveBeenCalledWith(true);
  });
  it("labels mandatory linking and cannot opt out while enabled", () => {
    render(
      <AccountSection
        formData={formData}
        onChange={() => {}}
        onSocialRegister={() => {}}
        discordLinkRequired
      />
    );
    const checkbox = screen.getByRole("checkbox", { name: /Link Discord/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText("(Required)")).toBeTruthy();
  });
});
