/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/control/players/users",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/admin/nav/AdminAlertsStrip", () => ({ AdminAlertsStrip: () => null }));
vi.mock("@/components/admin/system/ClockDriftBanner", () => ({ ClockDriftBanner: () => null }));

import { ControlShell } from "./ControlShell";
import { ReadOnlyGuard } from "./ReadOnlyGuard";

afterEach(cleanup);

function shell(role: "admin" | "moderator" | "junior_dev") {
  return render(
    <ControlShell role={role} username="tester">
      <p>body</p>
    </ControlShell>
  );
}

describe("ControlShell navigation", () => {
  it("shows moderators only the moderator tools", () => {
    shell("moderator");
    expect(screen.getAllByRole("link", { name: "Users" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Seed database" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Staff roles" })).toBeNull();
    expect(screen.queryByText(/Read-only access/)).toBeNull();
  });

  it("shows admins every tool and no read-only notice", () => {
    shell("admin");
    expect(screen.getAllByRole("link", { name: "Seed database" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Staff roles" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Read-only access/)).toBeNull();
  });

  it("shows junior devs every tool, including diagnostics, with a read-only notice", () => {
    shell("junior_dev");
    expect(screen.getAllByRole("link", { name: "Logs" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Seed database" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Read-only access/)).toBeTruthy();
  });

  it("marks the current tool", () => {
    shell("admin");
    const current = screen.getAllByRole("link", { name: "Users" })[0]!;
    expect(current.getAttribute("aria-current")).toBe("page");
  });
});

describe("View as", () => {
  const withReal = (role: "admin" | "moderator" | "junior_dev", real: typeof role) =>
    render(
      <ControlShell role={role} realRole={real} username="tester">
        <p>body</p>
      </ControlShell>
    );

  it("shows the switch to admins only", () => {
    withReal("admin", "admin");
    expect(screen.getByLabelText("View as")).toBeTruthy();
    cleanup();
    withReal("moderator", "moderator");
    expect(screen.queryByLabelText("View as")).toBeNull();
  });

  it("shows the banner and a way back while an admin previews", () => {
    withReal("moderator", "admin");
    expect(
      screen.getByText("Viewing as Moderator. Your own admin access is unchanged.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to admin" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Seed database" })).toBeNull();
  });

  it("shows no banner when not previewing", () => {
    withReal("admin", "admin");
    expect(screen.queryByText(/Viewing as/)).toBeNull();
  });
});

describe("ReadOnlyGuard", () => {
  it("blocks writes to the API in the browser and lets reads through", async () => {
    const original = vi.fn(async () => new Response("ok"));
    window.fetch = original as unknown as typeof window.fetch;
    const { unmount } = render(<ReadOnlyGuard active />);

    const blocked = await window.fetch("/api/admin/users/ban", { method: "POST" });
    expect(blocked.status).toBe(403);
    expect(original).not.toHaveBeenCalled();

    await window.fetch("/api/admin/users");
    expect(original).toHaveBeenCalledTimes(1);

    unmount();
    expect(window.fetch).toBe(original);
  });

  it("does nothing for roles that can write", async () => {
    const original = vi.fn(async () => new Response("ok"));
    window.fetch = original as unknown as typeof window.fetch;
    render(<ReadOnlyGuard active={false} />);
    await window.fetch("/api/admin/users/ban", { method: "POST" });
    expect(original).toHaveBeenCalledTimes(1);
  });
});
