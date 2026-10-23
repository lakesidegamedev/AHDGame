import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequestTimingSample } from "./requestTimings";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

function sample(overrides: Partial<ApiRequestTimingSample> = {}): ApiRequestTimingSample {
  return {
    at: new Date("2026-10-23T12:00:00.000Z"),
    route: "/api/actions/execute",
    durationMs: 40,
    status: 200,
    result: "success",
    stages: { authMs: 3, coreMs: 10 },
    ...overrides,
  };
}

/** Load the module fresh against a fake db whose only method is updateOne. */
async function loadWithDb(updateOne: ReturnType<typeof vi.fn>) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue({ collection: () => ({ updateOne }) } as never);
  return import("./requestTimings");
}

describe("recordApiRequestTiming", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("persists a slow request into the bounded diagnostics document", async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const { recordApiRequestTiming } = await loadWithDb(updateOne);

    await recordApiRequestTiming(sample({ durationMs: 1200 }), { rng: () => 0.99 });

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0]!;
    expect(filter).toEqual({ _id: "apiRequestTimings" });
    expect(update.$push.samples.$slice).toBe(-60);
    expect(update.$push.samples.$each).toHaveLength(1);
    expect(update.$set).toEqual({ updatedAt: sample().at });
    expect(options).toEqual({ upsert: true });
  });

  it("persists a fast request when the random draw is below the sample rate", async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const { recordApiRequestTiming } = await loadWithDb(updateOne);

    await recordApiRequestTiming(sample({ durationMs: 20 }), { rng: () => 0.01 });

    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it("writes nothing for an unsampled fast request", async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const { recordApiRequestTiming } = await loadWithDb(updateOne);

    await expect(
      recordApiRequestTiming(sample({ durationMs: 20 }), { rng: () => 0.05 })
    ).resolves.toBeUndefined();

    expect(updateOne).not.toHaveBeenCalled();
  });

  it("resolves without throwing when the database cannot be opened", async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error("diagnostics down"));
    const { recordApiRequestTiming } = await loadWithDb(updateOne);
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockRejectedValue(new Error("no connection"));

    await expect(
      recordApiRequestTiming(sample({ durationMs: 5000 }), { rng: () => 0 })
    ).resolves.toBeUndefined();

    expect(updateOne).not.toHaveBeenCalled();
  });

  it("does not throw or reject when only the write fails", async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error("write failed"));
    const { recordApiRequestTiming } = await loadWithDb(updateOne);

    await expect(recordApiRequestTiming(sample({ durationMs: 5000 }))).resolves.toBeUndefined();
  });

  it("persists timing fields only, with no identity fields", async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const { recordApiRequestTiming } = await loadWithDb(updateOne);

    await recordApiRequestTiming(sample({ actionType: "fundraise", requestedCount: 10 }), {
      rng: () => 0,
    });

    const persisted = updateOne.mock.calls[0]![1].$push.samples.$each[0];
    expect(Object.keys(persisted).sort()).toEqual([
      "actionType",
      "at",
      "durationMs",
      "requestedCount",
      "result",
      "route",
      "stages",
      "status",
    ]);
  });
});

describe("recordApiRequestTimingSafely", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns immediately and swallows a rejected write", async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error("write failed"));
    const { recordApiRequestTimingSafely } = await loadWithDb(updateOne);

    expect(() => recordApiRequestTimingSafely(sample({ durationMs: 5000 }))).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
