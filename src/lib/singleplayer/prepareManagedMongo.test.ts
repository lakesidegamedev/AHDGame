import { describe, expect, it, vi } from "vitest";
import { initializeLocalReplicaSet } from "./prepareManagedMongo";
const host = "127.0.0.1:27117";
describe("managed singleplayer replica set", () => {
  it("initializes a fresh or previously standalone data directory before serving", async () => {
    const command = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("not initialized"), { code: 94 }))
      .mockResolvedValueOnce({ ok: 1 })
      .mockResolvedValueOnce({ isWritablePrimary: true, setName: "ahd-local" });
    await initializeLocalReplicaSet({ command }, host);
    expect(command).toHaveBeenNthCalledWith(2, {
      replSetInitiate: { _id: "ahd-local", members: [{ _id: 0, host }] },
    });
  });
  it("preserves an existing single-node replica set", async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce({ set: "ahd-local", members: [{ name: host }] })
      .mockResolvedValueOnce({ isWritablePrimary: true, setName: "ahd-local" });
    await initializeLocalReplicaSet({ command }, host);
    expect(command).toHaveBeenCalledTimes(2);
  });
  it("accepts a concurrent initializer winning the race", async () => {
    const command = vi
      .fn()
      .mockRejectedValueOnce({ code: 94 })
      .mockRejectedValueOnce({ code: 23 })
      .mockResolvedValueOnce({ isWritablePrimary: true, setName: "ahd-local" });
    await initializeLocalReplicaSet({ command }, host);
  });
  it("moves a single-node set to the new port when the client picked another one", async () => {
    const command = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("not a member"), { code: 93 }))
      .mockResolvedValueOnce({
        config: { _id: "ahd-local", version: 1, members: [{ _id: 0, host: "127.0.0.1:50000" }] },
      })
      .mockResolvedValueOnce({ ok: 1 })
      .mockResolvedValueOnce({ isWritablePrimary: true, setName: "ahd-local" });
    await initializeLocalReplicaSet({ command }, host);
    expect(command).toHaveBeenNthCalledWith(3, {
      replSetReconfig: { _id: "ahd-local", version: 2, members: [{ _id: 0, host }] },
      force: true,
    });
  });
  it("never reconfigures a set that is not the local single-node one", async () => {
    for (const config of [
      { _id: "other", version: 1, members: [{ _id: 0, host: "a:1" }] },
      {
        _id: "ahd-local",
        version: 1,
        members: [
          { _id: 0, host: "a:1" },
          { _id: 1, host: "b:2" },
        ],
      },
    ]) {
      const command = vi.fn().mockRejectedValueOnce({ code: 93 }).mockResolvedValueOnce({ config });
      await expect(initializeLocalReplicaSet({ command }, host)).rejects.toThrow("configuration");
      expect(command).toHaveBeenCalledTimes(2);
    }
  });
  it("refuses unrelated replication configurations without changing them", async () => {
    const command = vi.fn().mockResolvedValue({ set: "other", members: [{ name: host }] });
    await expect(initializeLocalReplicaSet({ command }, host)).rejects.toThrow("configuration");
    expect(command).toHaveBeenCalledOnce();
  });
  it("does not suppress startup failures", async () => {
    const command = vi.fn().mockRejectedValue(new Error("unavailable"));
    await expect(initializeLocalReplicaSet({ command }, host)).rejects.toThrow("unavailable");
  });
});
