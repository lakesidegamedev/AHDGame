import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Db } from "mongodb";

const archive = vi.hoisted(() => ({
  write: vi.fn(),
  verify: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@/lib/singleplayer/saveArchive", () => ({
  writeSaveArchive: archive.write,
  verifySaveArchive: archive.verify,
  restoreSaveArchive: archive.restore,
}));

import {
  AUTOSAVES_KEPT,
  SaveError,
  applyPendingRestore,
  cleanSaveName,
  createManualSave,
  deleteSave,
  listSaves,
  maybeAutosave,
  readSaveSettings,
  readSaveState,
  requestLoad,
  writeSaveSettings,
} from "./saves";

let home: string;
let world: { currentTurn: number; isProcessing: boolean } | null;

function fakeDb(): Db {
  return {
    collection: (name: string) => ({
      findOne: async () =>
        name === "gameState" && world
          ? { ...world, preset: "1991-default", singleplayerConfig: { mode: "normal" } }
          : name === "characters"
            ? { name: "Ada" }
            : null,
    }),
  } as unknown as Db;
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "ahd-saves-"));
  world = { currentTurn: 5, isProcessing: false };
  archive.write.mockImplementation(async (_db: Db, file: string) => {
    await writeFile(file, "archive");
    return { collections: 1, documents: 1 };
  });
  archive.verify.mockResolvedValue({ collections: 1, documents: 1 });
  archive.restore.mockResolvedValue({ collections: 1, documents: 1 });
});

afterEach(async () => {
  vi.clearAllMocks();
  await rm(home, { recursive: true, force: true });
});

describe("manual saves", () => {
  it("records what the list needs and keeps the save inside the world folder", async () => {
    const save = await createManualSave(fakeDb(), "  Before the vote \n", home);
    expect(save).toMatchObject({
      kind: "manual",
      name: "Before the vote",
      turn: 5,
      preset: "1991-default",
      mode: "normal",
      characterName: "Ada",
    });
    expect(save.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(path.join(home, "saves", save.id, "world.ahdsave"))).toBe(true);
    expect((await listSaves(home)).map((s) => s.id)).toEqual([save.id]);
  });

  it("names an unnamed save after its turn", async () => {
    expect((await createManualSave(fakeDb(), "   ", home)).name).toBe("Turn 5");
  });

  it("refuses while a turn runs, and with no world", async () => {
    world = { currentTurn: 5, isProcessing: true };
    await expect(createManualSave(fakeDb(), "x", home)).rejects.toMatchObject({ status: 409 });
    world = null;
    await expect(createManualSave(fakeDb(), "x", home)).rejects.toBeInstanceOf(SaveError);
    expect(await listSaves(home)).toEqual([]);
  });

  it("leaves nothing behind when the dump fails", async () => {
    archive.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(createManualSave(fakeDb(), "x", home)).rejects.toThrow("disk full");
    expect(await listSaves(home)).toEqual([]);
  });

  it("strips control characters and caps the name", () => {
    expect(cleanSaveName("a\u0000b\tc")).toBe("a b c");
    expect(cleanSaveName("x".repeat(200))).toHaveLength(60);
    expect(cleanSaveName(42)).toBe("");
  });

  it("deletes a save, and cannot delete one that is about to be loaded", async () => {
    const a = await createManualSave(fakeDb(), "a", home);
    const b = await createManualSave(fakeDb(), "b", home);
    await requestLoad(b.id, home);
    await expect(deleteSave(b.id, home)).rejects.toMatchObject({ status: 409 });
    expect(await deleteSave(a.id, home)).toBe(true);
    expect(await deleteSave(a.id, home)).toBe(false);
    expect(await deleteSave("../../etc", home)).toBe(false);
  });
});

describe("autosave", () => {
  it("defaults to every turn and keeps only the last three", async () => {
    for (let turn = 1; turn <= 5; turn += 1) {
      world = { currentTurn: turn, isProcessing: false };
      await maybeAutosave(fakeDb(), turn, home);
    }
    const autos = (await listSaves(home)).filter((s) => s.kind === "auto");
    expect(autos).toHaveLength(AUTOSAVES_KEPT);
    expect(autos.map((s) => s.turn).sort()).toEqual([3, 4, 5]);
  });

  it("saves after every Nth turn, counting from the last autosave", async () => {
    await writeSaveSettings({ autosaveEvery: 3 }, home);
    const taken: number[] = [];
    for (let turn = 1; turn <= 8; turn += 1) {
      world = { currentTurn: turn, isProcessing: false };
      if (await maybeAutosave(fakeDb(), turn, home)) taken.push(turn);
    }
    expect(taken).toEqual([1, 4, 7]);
  });

  it("covers a batch of turns with one save", async () => {
    await writeSaveSettings({ autosaveEvery: 2 }, home);
    world = { currentTurn: 1, isProcessing: false };
    await maybeAutosave(fakeDb(), 1, home);
    world = { currentTurn: 11, isProcessing: false };
    expect(await maybeAutosave(fakeDb(), 11, home)).not.toBeNull();
  });

  it("is off at 0 and never touches manual saves", async () => {
    const manual = await createManualSave(fakeDb(), "keep", home);
    await writeSaveSettings({ autosaveEvery: 0 }, home);
    expect(await maybeAutosave(fakeDb(), 6, home)).toBeNull();
    await writeSaveSettings({ autosaveEvery: 1 }, home);
    for (let turn = 6; turn <= 12; turn += 1) {
      world = { currentTurn: turn, isProcessing: false };
      await maybeAutosave(fakeDb(), turn, home);
    }
    const all = await listSaves(home);
    expect(all.filter((s) => s.kind === "auto")).toHaveLength(3);
    expect(all.some((s) => s.id === manual.id)).toBe(true);
  });

  it("records a failure for the list and does not throw", async () => {
    archive.write.mockRejectedValueOnce(new Error("disk full"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await maybeAutosave(fakeDb(), 5, home)).toBeNull();
    expect((await readSaveState(home)).lastAutosaveError?.message).toBe("disk full");
    expect(await maybeAutosave(fakeDb(), 5, home)).not.toBeNull();
    expect((await readSaveState(home)).lastAutosaveError).toBeNull();
    log.mockRestore();
  });

  it("validates the interval", async () => {
    await expect(writeSaveSettings({ autosaveEvery: -1 }, home)).rejects.toBeInstanceOf(SaveError);
    await expect(writeSaveSettings({ autosaveEvery: 1.5 }, home)).rejects.toBeInstanceOf(SaveError);
    expect(await readSaveSettings(home)).toEqual({ autosaveEvery: 1 });
  });
});

describe("loading a save", () => {
  it("only leaves a marker; the live world is untouched until the next start", async () => {
    const save = await createManualSave(fakeDb(), "a", home);
    await requestLoad(save.id, home);
    expect(JSON.parse(await readFile(path.join(home, "restore-pending.json"), "utf8")).saveId).toBe(
      save.id
    );
    expect(archive.restore).not.toHaveBeenCalled();
    await expect(requestLoad("20260101T000000Z-abcdef", home)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("saves the current state first, restores, and clears the marker", async () => {
    const save = await createManualSave(fakeDb(), "target", home);
    world = { currentTurn: 9, isProcessing: false };
    await requestLoad(save.id, home);
    const outcome = await applyPendingRestore(fakeDb(), home);
    expect(outcome).toMatchObject({ ok: true, saveName: "target" });
    expect(archive.restore).toHaveBeenCalledTimes(1);
    const safety = (await listSaves(home)).filter((s) => s.kind === "safety");
    expect(safety).toHaveLength(1);
    expect(safety[0]).toMatchObject({ turn: 9, name: "Before loading target" });
    expect(existsSync(path.join(home, "restore-pending.json"))).toBe(false);
    expect((await readSaveState(home)).lastRestore?.ok).toBe(true);
    expect(await applyPendingRestore(fakeDb(), home)).toBeNull();
  });

  it("verifies before touching anything, and says the world is unchanged", async () => {
    const save = await createManualSave(fakeDb(), "target", home);
    await requestLoad(save.id, home);
    archive.verify.mockRejectedValueOnce(new Error("The save file is cut short."));
    const outcome = await applyPendingRestore(fakeDb(), home);
    expect(outcome?.ok).toBe(false);
    expect(outcome?.message).toContain("unchanged");
    expect(archive.restore).not.toHaveBeenCalled();
    expect(existsSync(path.join(home, "restore-pending.json"))).toBe(false);
  });

  it("puts the previous state back when the restore fails part way", async () => {
    const save = await createManualSave(fakeDb(), "target", home);
    await requestLoad(save.id, home);
    archive.restore.mockRejectedValueOnce(new Error("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await applyPendingRestore(fakeDb(), home);
    log.mockRestore();
    expect(outcome?.ok).toBe(false);
    expect(outcome?.message).toContain("put back");
    expect(archive.restore).toHaveBeenCalledTimes(2);
  });

  it("drops a marker whose save is gone", async () => {
    const save = await createManualSave(fakeDb(), "target", home);
    await requestLoad(save.id, home);
    await rm(path.join(home, "saves", save.id), { recursive: true });
    const outcome = await applyPendingRestore(fakeDb(), home);
    expect(outcome?.ok).toBe(false);
    expect(existsSync(path.join(home, "restore-pending.json"))).toBe(false);
  });

  it("shares one restore between concurrent callers", async () => {
    const save = await createManualSave(fakeDb(), "target", home);
    await requestLoad(save.id, home);
    const [a, b] = await Promise.all([
      applyPendingRestore(fakeDb(), home),
      applyPendingRestore(fakeDb(), home),
    ]);
    expect(a).toBe(b);
    expect(archive.restore).toHaveBeenCalledTimes(1);
  });
});
