/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useRef } from "react";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { GlobePoster } from "./GlobePoster";
import { GLOBE_FALLBACK_DELAY_MS, useGlobeActivation } from "./useGlobeActivation";

let intersect: (visible: boolean) => void = () => {};
let reducedMotion = false;

class FakeObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {
    intersect = (visible) => this.cb([{ isIntersecting: visible }]);
  }
  observe() {}
  disconnect() {}
}

function Probe({ hasPoster, onValue }: { hasPoster: boolean; onValue: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  onValue(useGlobeActivation(ref, hasPoster));
  return <div ref={ref} />;
}

function mount(hasPoster: boolean) {
  const values: boolean[] = [];
  render(<Probe hasPoster={hasPoster} onValue={(v) => values.push(v)} />);
  return () => values[values.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  Object.assign(window, {
    matchMedia: () => ({
      matches: reducedMotion,
      addEventListener() {},
      removeEventListener() {},
    }),
    requestIdleCallback: (cb: () => void) => setTimeout(cb, 0),
    cancelIdleCallback: (id: number) => clearTimeout(id),
  });
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useGlobeActivation", () => {
  it("stays off until idle, visible and engaged", () => {
    const value = mount(true);
    expect(value()).toBe(false);
    act(() => void vi.advanceTimersByTime(100));
    act(() => intersect(true));
    expect(value()).toBe(false);
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    expect(value()).toBe(true);
  });

  it("does not load while the globe box is off screen", () => {
    const value = mount(true);
    act(() => void vi.advanceTimersByTime(100));
    act(() => intersect(false));
    act(() => void window.dispatchEvent(new Event("wheel")));
    expect(value()).toBe(false);
  });

  it("loads after the fallback delay without interaction", () => {
    const value = mount(true);
    act(() => intersect(true));
    act(() => void vi.advanceTimersByTime(GLOBE_FALLBACK_DELAY_MS - 1));
    expect(value()).toBe(false);
    act(() => void vi.advanceTimersByTime(2));
    expect(value()).toBe(true);
  });

  it("keeps the poster under reduced motion", () => {
    reducedMotion = true;
    const value = mount(true);
    act(() => intersect(true));
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    act(() => void vi.advanceTimersByTime(GLOBE_FALLBACK_DELAY_MS + 100));
    expect(value()).toBe(false);
  });

  it("without a poster only needs idle and visibility", () => {
    const value = mount(false);
    act(() => intersect(true));
    act(() => void vi.advanceTimersByTime(100));
    expect(value()).toBe(true);
  });
});

describe("GlobePoster", () => {
  it("renders on the server with fixed dimensions and both formats", () => {
    const html = renderToString(<GlobePoster base="/landing/globe-2027" hidden={false} />);
    expect(html).toContain('type="image/avif"');
    expect(html).toContain("/landing/globe-2027-640.avif 640w");
    expect(html).toContain('src="/landing/globe-2027-1200.webp"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="1200"');
    expect(html).toContain("opacity-100");
  });

  it("fades out once the live globe is drawn", () => {
    expect(renderToString(<GlobePoster base="/x" hidden />)).toContain("opacity-0");
  });
});
