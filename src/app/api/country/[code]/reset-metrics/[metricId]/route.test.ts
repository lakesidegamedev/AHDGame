import { describe, expect, it, vi } from "vitest";
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/resetMetrics/readBoard", () => ({ readResetMetricBoard: vi.fn() }));
vi.mock("@/lib/resetMetrics/readMetricDetail", () => ({ readResetMetricDetail: vi.fn() }));

describe("metric detail country coverage", () => {
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "allows the reviewed metric path in %s",
    async (countryId) => {
      const { readResetMetricBoard } = await import("@/lib/resetMetrics/readBoard");
      const { readResetMetricDetail } = await import("@/lib/resetMetrics/readMetricDetail");
      vi.mocked(readResetMetricBoard).mockResolvedValue({
        status: "ready",
        board: {} as ResetMetricSnapshot,
      });
      vi.mocked(readResetMetricDetail).mockResolvedValue({
        history: [],
        nationalValue: 30,
        regions: [],
      });
      const { GET } = await import("./route");
      const response = await GET(
        new Request(`http://localhost/api/country/${countryId}/reset-metrics/24`),
        { params: Promise.resolve({ code: countryId, metricId: "24" }) }
      );
      expect(response.status).toBe(200);
    }
  );
  it("does not activate an unreviewed legacy country", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/country/de/reset-metrics/24"), {
      params: Promise.resolve({ code: "DE", metricId: "24" }),
    });
    expect(response.status).toBe(404);
  });
});
