/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GroupChart } from "./GroupChart";
import type { CorporationDetail } from "../CorporationPageTypes";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const corp = (over: Partial<CorporationDetail> = {}) =>
  ({ _id: "c1", sequentialId: 7, name: "Keystone", ...over }) as CorporationDetail;

describe("GroupChart", () => {
  it("children list ownership", () => {
    render(
      <GroupChart
        corporation={corp({
          subsidiaries: [
            { _id: "s1", sequentialId: 21, name: "Keystone Steel", ownershipPct: 80 },
            { _id: "s2", name: "Keystone Media", ownershipPct: 100 },
          ],
        })}
      />
    );
    const children = screen.getByRole("list", { name: "Subsidiaries" });
    const steel = within(children).getByText("Keystone Steel").closest("li")!;
    expect(within(steel).getByText("80.0% owned")).toBeTruthy();
    expect(within(steel).getByRole("link").getAttribute("href")).toBe("/corporation/21");
    const media = within(children).getByText("Keystone Media").closest("li")!;
    expect(within(media).getByRole("link").getAttribute("href")).toBe("/corporation/s2");
  });

  it("parent shown above a subsidiary", () => {
    const { container } = render(
      <GroupChart
        corporation={corp({
          parentCorporation: { _id: "p1", sequentialId: 3, name: "Holdco", ownershipPct: 64.25 },
        })}
      />
    );
    const parent = screen.getByText("Holdco");
    const self = screen.getByText("Keystone");
    expect(parent.compareDocumentPosition(self) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("owns 64.3%")).toBeTruthy();
    expect(container.querySelector('a[href="/corporation/3"]')).not.toBeNull();
  });

  it("spin off slot only when allowed", () => {
    const onSpinOff = vi.fn();
    const { rerender } = render(<GroupChart corporation={corp()} onSpinOff={onSpinOff} />);
    fireEvent.click(screen.getByRole("button", { name: /Spin off a subsidiary/ }));
    expect(onSpinOff).toHaveBeenCalled();
    rerender(<GroupChart corporation={corp({ subsidiaries: [] })} />);
    expect(screen.queryByRole("button", { name: /Spin off a subsidiary/ })).toBeNull();
  });

  it("draws nothing for a corporation with no group", () => {
    const { container } = render(<GroupChart corporation={corp()} />);
    expect(container.innerHTML).toBe("");
  });
});
