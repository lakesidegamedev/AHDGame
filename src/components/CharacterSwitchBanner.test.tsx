/** @vitest-environment happy-dom */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

import { CharacterSwitchBanner } from "./CharacterSwitchBanner";
import {
  noteRenderedCharacter,
  noteServerCharacter,
  resetActiveCharacterGuardForTests,
} from "@/lib/activeCharacterGuard";

describe("CharacterSwitchBanner", () => {
  beforeEach(() => {
    resetActiveCharacterGuardForTests();
    document.body.innerHTML = '<main id="m"></main>';
  });

  it("shows the banner and makes the page inert when the server reports another character", () => {
    render(<CharacterSwitchBanner />);
    expect(screen.queryByTestId("character-switch-banner")).toBeNull();
    act(() => {
      noteRenderedCharacter("a");
      noteServerCharacter("b", "Other");
    });
    expect(screen.getByTestId("character-switch-banner").textContent).toContain(
      "messageNamed:Other"
    );
    expect(document.querySelector("main")?.hasAttribute("inert")).toBe(true);
  });
});
