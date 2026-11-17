import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAudit } from "@/lib/audit/recordAudit";
import { recordProviderLinkAudit } from "./providerLinkAudit";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe("provider link audit", () => {
  it("correlates attempts without storing raw OAuth state or provider credentials", () => {
    const common = {
      provider: "discord" as const,
      state: "synthetic-sensitive-state",
      userId: "000000000000000000000001",
    };
    recordProviderLinkAudit({ ...common, stage: "start", reason: "started" });
    recordProviderLinkAudit({ ...common, stage: "result", reason: "account_mismatch" });
    const [start, result] = vi.mocked(recordAudit).mock.calls.map(([entry]) => entry);
    expect(start.meta?.flowId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.meta?.flowId).toBe(start.meta?.flowId);
    expect(start.actor?.userId?.toString()).toBe(common.userId);
    expect(result.outcome).toBe("rejected");
    expect(JSON.stringify(vi.mocked(recordAudit).mock.calls)).not.toContain(common.state);
    expect(Object.keys(start.meta ?? {})).toEqual(["provider", "flowId"]);
  });
  it("does not fail authentication when audit recording fails", () => {
    vi.mocked(recordAudit).mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() =>
      recordProviderLinkAudit({ provider: "discord", stage: "callback", reason: "exchange_failed" })
    ).not.toThrow();
  });
  it("bounds untrusted state and accepts anonymous failure events", () => {
    recordProviderLinkAudit({
      provider: "discord",
      stage: "callback",
      reason: "invalid_state",
      state: "x".repeat(1025),
      userId: "invalid",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { kind: "system" },
        meta: { provider: "discord", flowId: undefined },
      })
    );
  });
});
