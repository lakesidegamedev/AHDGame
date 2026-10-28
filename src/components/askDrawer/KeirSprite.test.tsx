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
});
