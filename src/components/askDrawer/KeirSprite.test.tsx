// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { KEIR_STATES, KeirSprite } from "./KeirSprite";

describe("KeirSprite", () => {
  it("shows the requested state's row from the bundled sheet, crisp at whole-number scale", () => {
    const { container } = render(<KeirSprite mood="thinking" scale={2} />);
    const el = container.querySelector("[data-keir-mood]") as HTMLElement;
    expect(el.dataset.keirMood).toBe("thinking");
    expect(el.style.backgroundImage).toContain("/ask/keir-M.png");
    expect(el.style.width).toBe("80px");
    expect(el.style.backgroundPosition).toBe(`0px -${KEIR_STATES.thinking.row * 80}px`);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("knows every one of the sheet's 45 rows once, within the sheet's 10 columns", () => {
    const states = Object.values(KEIR_STATES);
    expect(states).toHaveLength(45);
    expect(new Set(states.map((s) => s.row)).size).toBe(45);
    for (const state of states) {
      expect(state.row).toBeGreaterThanOrEqual(0);
      expect(state.row).toBeLessThan(45);
      expect(state.frames).toBeGreaterThan(0);
      expect(state.frames).toBeLessThanOrEqual(10);
    }
    expect(KEIR_STATES.alert.row).toBe(8);
    expect(KEIR_STATES.sleeping.loop).toBe(true);
    expect(KEIR_STATES.look_right).toMatchObject({ row: 44, frames: 2 });
  });
});
