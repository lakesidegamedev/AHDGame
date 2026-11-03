/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SubsidiaryManagementCard } from "./SubsidiaryManagementCard";
import type { CorporationDetail } from "./CorporationPageTypes";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./SpinOffModal", () => ({ SpinOffModal: () => <div>Spin off modal</div> }));
vi.mock("./AppointSubsidiaryCeoModal", () => ({ AppointSubsidiaryCeoModal: () => null }));
vi.mock("./FormalizeSubsidiaryModal", () => ({ FormalizeSubsidiaryModal: () => null }));

const corp = (over: Partial<CorporationDetail>) =>
  ({ _id: "c1", name: "Keystone", ...over }) as CorporationDetail;

describe("SubsidiaryManagementCard group", () => {
  it("shows a visitor the group of a corporation with subsidiaries", () => {
    render(
      <SubsidiaryManagementCard
        corporation={corp({
          subsidiaries: [{ _id: "s1", name: "Keystone Steel", ownershipPct: 80 }],
        })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("Keystone Steel")).toBeTruthy();
    expect(screen.queryByText("Group effects")).toBeNull();
  });

  it("lists management overhead under group effects only when there is some", () => {
    render(
      <SubsidiaryManagementCard
        corporation={corp({
          subsidiaries: [{ _id: "s1", name: "Keystone Steel", ownershipPct: 80 }],
          managementOverheadPp: 2.34,
        })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("Group effects")).toBeTruthy();
    expect(screen.getByText("2.3 pts of margin")).toBeTruthy();
    expect(
      screen.getByText("grows with every plant the whole group runs, subsidiaries included")
    ).toBeTruthy();
  });

  it("passes the remaining spin off cooldown to the chart", () => {
    render(
      <SubsidiaryManagementCard
        corporation={corp({ canSpinOff: true, spinOffCooldownTurnsRemaining: 42 })}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("Available again in 42 turns.")).toBeTruthy();
  });

  it("opens the spin off modal from the chart slot", () => {
    render(
      <SubsidiaryManagementCard corporation={corp({ canSpinOff: true })} onChanged={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Spin off a subsidiary/ }));
    expect(screen.getByText("Spin off modal")).toBeTruthy();
  });
});
