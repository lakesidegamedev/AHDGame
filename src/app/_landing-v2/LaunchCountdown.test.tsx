/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/auth.json";
import de from "../../../messages/de/auth.json";
import { ANNOUNCED_2027_LAUNCH } from "@/lib/landing/rules/launchSchedule";
import { formatEastern, formatRemaining, LaunchCountdown } from "./LaunchCountdown";

const sealed = {
  phase: "sealed" as const,
  opensAt: new Date(ANNOUNCED_2027_LAUNCH.opensAt).toISOString(),
  firstTurnAt: new Date(ANNOUNCED_2027_LAUNCH.firstTurnAt).toISOString(),
};

function renderIn(
  locale: "en" | "de",
  schedule: Parameters<typeof LaunchCountdown>[0]["schedule"]
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ auth: (locale === "en" ? en : de).auth }}>
      <LaunchCountdown schedule={schedule} />
    </NextIntlClientProvider>
  );
}

describe("LaunchCountdown", () => {
  it("names doors open and the first turn in Eastern time", () => {
    const { getByText, container } = renderIn("en", sealed);
    expect(getByText("Doors open")).toBeTruthy();
    expect(getByText("First turn")).toBeTruthy();
    expect(container.textContent).toContain("Sun, Nov 15, 5:00 PM Eastern");
    expect(container.textContent).toContain("Mon, Nov 16, 5:00 PM Eastern");
    expect(getByText("Sign-ups open when the world opens.")).toBeTruthy();
  });

  it("reads in German with a 24 hour clock", () => {
    const { container } = renderIn("de", sealed);
    expect(container.textContent).toContain("Die Welt öffnet");
    expect(container.textContent).toContain("17:00");
  });

  it("drops a time that has passed, and renders nothing once both have", () => {
    const open = { phase: "open" as const, opensAt: null, firstTurnAt: sealed.firstTurnAt };
    const { queryByText } = renderIn("en", open);
    expect(queryByText("Doors open")).toBeNull();
    expect(queryByText("First turn")).toBeTruthy();
    const running = { phase: "running" as const, opensAt: null, firstTurnAt: null };
    expect(renderIn("en", running).container.innerHTML).toBe("");
  });

  it("formats with plain spaces, so server and browser agree", () => {
    expect(formatEastern(sealed.opensAt, "en")).not.toMatch(/[  ]/);
    expect(formatRemaining({ days: 1, hours: 2, minutes: 3, seconds: 4 })).toBe("01d 02:03:04");
    expect(formatRemaining(null)).toBe("--d --:--:--");
  });
});
