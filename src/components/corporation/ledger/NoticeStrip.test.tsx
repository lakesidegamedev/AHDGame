/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NoticeStrip } from "./NoticeStrip";

describe("NoticeStrip", () => {
  it("uses alert for errors and status otherwise", () => {
    const { rerender } = render(
      <NoticeStrip tone="error" tag="Default">
        Bond default.
      </NoticeStrip>
    );
    expect(screen.getByRole("alert").textContent).toContain("Bond default.");
    rerender(
      <NoticeStrip tone="warning" tag="Bond due">
        Repayment soon.
      </NoticeStrip>
    );
    expect(screen.getByRole("status").textContent).toContain("Repayment soon.");
  });

  it("renders tag text and action", () => {
    render(
      <NoticeStrip tone="info" tag="Listing" action={<button type="button">Review</button>}>
        Not listed.
      </NoticeStrip>
    );
    expect(screen.getByText("Listing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
  });

  it("offers a labelled dismiss only when dismissable", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <NoticeStrip tone="info" tag="Listing">
        Not listed.
      </NoticeStrip>
    );
    expect(screen.queryByRole("button", { name: "Dismiss notice" })).toBeNull();
    rerender(
      <NoticeStrip tone="info" tag="Listing" onDismiss={onDismiss} dismissLabel="Dismiss notice">
        Not listed.
      </NoticeStrip>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
