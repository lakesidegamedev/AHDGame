// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useClickOutside } from "./useClickOutside";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useClickOutside", () => {
  it("calls onClose when a mousedown fires outside the ref", () => {
    const inner = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(inner);
    document.body.appendChild(outside);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, true, onClose));

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when the click is inside the ref", () => {
    const inner = document.createElement("div");
    const child = document.createElement("button");
    inner.appendChild(child);
    document.body.appendChild(inner);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, true, onClose));

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is inactive when isActive is false (no listener attached)", () => {
    const inner = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(inner);
    document.body.appendChild(outside);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, false, onClose));

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the click event when eventType is 'click'", () => {
    const inner = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(inner);
    document.body.appendChild(outside);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, true, onClose, { eventType: "click" }));

    // mousedown should not trigger
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    // click should
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape when closeOnEscape is true", () => {
    const inner = document.createElement("div");
    document.body.appendChild(inner);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, true, onClose, { closeOnEscape: true }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores Escape when closeOnEscape is false (default)", () => {
    const inner = document.createElement("div");
    document.body.appendChild(inner);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    renderHook(() => useClickOutside(ref, true, onClose));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const inner = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(inner);
    document.body.appendChild(outside);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, "current", { value: inner, writable: true });
    const onClose = vi.fn();

    const { unmount } = renderHook(() => useClickOutside(ref, true, onClose));
    unmount();

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

it("detaches both dismissal listeners when closed or unmounted, and supports reopening", () => {
  const inner = document.createElement("div");
  const child = inner.appendChild(document.createElement("button"));
  document.body.appendChild(inner);
  const ref = createRef<HTMLDivElement>();
  Object.defineProperty(ref, "current", { value: inner });
  const onClose = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ active }) => useClickOutside(ref, active, onClose, { closeOnEscape: true }),
    { initialProps: { active: false } }
  );
  const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  const outside = () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  escape();
  outside();
  expect(onClose).not.toHaveBeenCalled();
  rerender({ active: true });
  child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(onClose).not.toHaveBeenCalled();
  escape();
  expect(onClose).toHaveBeenCalledOnce();
  onClose.mockClear();
  rerender({ active: false });
  escape();
  outside();
  expect(onClose).not.toHaveBeenCalled();
  rerender({ active: true });
  outside();
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  escape();
  outside();
  expect(onClose).toHaveBeenCalledOnce();
});
