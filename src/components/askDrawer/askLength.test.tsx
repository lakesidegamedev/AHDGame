// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AskLengthSelect, LENGTH_KEY, parseLength, useAskLength } from "./askLength";

describe("askLength", () => {
  beforeEach(() => localStorage.clear());

  it("treats anything unknown as Standard", () => {
    expect(parseLength("concise")).toBe("concise");
    expect(parseLength("deep")).toBe("standard");
    expect(parseLength(null)).toBe("standard");
  });

  it("defaults to Standard and remembers a change", () => {
    const first = renderHook(() => useAskLength());
    expect(first.result.current[0]).toBe("standard");
    act(() => first.result.current[1]("concise"));
    expect(localStorage.getItem(LENGTH_KEY)).toBe("concise");
    first.unmount();
    expect(renderHook(() => useAskLength()).result.current[0]).toBe("concise");
  });

  it("offers Concise and Standard", () => {
    let chosen = "";
    render(<AskLengthSelect value="standard" onChange={(v) => (chosen = v)} />);
    fireEvent.change(screen.getByLabelText("Answer length"), { target: { value: "concise" } });
    expect(chosen).toBe("concise");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Standard",
      "Concise",
    ]);
  });
});
