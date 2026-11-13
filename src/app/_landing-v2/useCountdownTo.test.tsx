/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, render } from "@testing-library/react";
import { remainingUntil, useCountdownTo } from "./useCountdownTo";

const TARGET = Date.parse("2026-11-15T17:00:00-05:00");

function Harness({ target }: { target: string | number | null }) {
  const r = useCountdownTo(target);
  return (
    <span data-testid="out">
      {r ? `${r.days}d ${r.hours}h ${r.minutes}m ${r.seconds}s` : "none"}
    </span>
  );
}

describe("remainingUntil", () => {
  it("splits the gap into days, hours, minutes and seconds", () => {
    expect(remainingUntil(TARGET, TARGET - ((26 * 60 + 3) * 60 + 4) * 1000)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
  });

  it("is null at and after the target", () => {
    expect(remainingUntil(TARGET, TARGET)).toBeNull();
    expect(remainingUntil(TARGET, TARGET + 1)).toBeNull();
    expect(remainingUntil(Number.NaN, TARGET)).toBeNull();
  });
});

describe("useCountdownTo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down to an ISO target and stops when it arrives", () => {
    vi.setSystemTime(TARGET - 2000);
    const { getByTestId } = render(<Harness target="2026-11-15T17:00:00-05:00" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(getByTestId("out").textContent).toBe("0d 0h 0m 2s");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(getByTestId("out").textContent).toBe("none");
  });

  it("renders nothing for a missing or unparseable target", () => {
    vi.setSystemTime(TARGET - 60_000);
    const a = render(<Harness target={null} />);
    const b = render(<Harness target="not a date" />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(a.container.textContent).toBe("none");
    expect(b.container.textContent).toBe("none");
  });
});
