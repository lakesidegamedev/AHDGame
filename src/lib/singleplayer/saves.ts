import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ObjectId, type Db } from "mongodb";
import { SINGLEPLAYER_USER_ID } from "@/lib/singleplayer";
import { RESTORE_MARKER_FILE, singleplayerHomeDir } from "@/lib/singleplayerServer";
import {
  restoreSaveArchive,
  verifySaveArchive,
  writeSaveArchive,
} from "@/lib/singleplayer/saveArchive";

/**
 * Save slots and autosaves for a local world.
 *
 * Saves live in `<world folder>/saves/<id>/`, so deleting a world deletes its
 * saves. Each holds `save.json` (what the list shows) and `world.ahdsave` (the
 * database, see saveArchive.ts). Loading never rewrites the live database from
 * a request: a load only leaves a marker, and the next start of the world
 * applies it before anyone is let in (`applyPendingRestore`, called from the
 * status route the launcher waits on). That is what makes the swap safe, with
 * no turn, tab or timer writing underneath it.
 */

export const AUTOSAVES_KEPT = 3;
export const SAFETY_SAVES_KEPT = 1;
export const MAX_SAVE_NAME_LENGTH = 60;
export const MAX_AUTOSAVE_INTERVAL = 100;
export const DEFAULT_AUTOSAVE_INTERVAL = 1;

const ARCHIVE_FILE = "world.ahdsave";
const META_FILE = "save.json";
const SETTINGS_FILE = "settings.json";
const STATE_FILE = "state.json";

const SAVE_ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/;

export type SaveKind = "manual" | "auto" | "safety";

export interface SaveMeta {
  id: string;
  kind: SaveKind;
  name: string;
  turn: number | null;
  preset: string | null;
  mode: string | null;
  characterName: string | null;
  createdAt: string;
  sizeBytes: number;
}

export interface SaveSettings {
  /** Autosave after every Nth turn. 0 turns autosave off. */
  autosaveEvery: number;
}

export interface SaveOutcome {
  at: string;
  ok: boolean;
  /** Plain words for a player. */
  message: string;
  saveName?: string;
}

interface SaveState {
  lastAutosaveError?: { at: string; message: string } | null;
  lastRestore?: SaveOutcome | null;
}

export function savesDir(home: string = singleplayerHomeDir()): string {
  return path.join(home, "saves");
}

export function isSaveId(value: unknown): value is string {
  return typeof value === "string" && SAVE_ID.test(value);
}

function newSaveId(now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

export function cleanSaveName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SAVE_NAME_LENGTH);
}

// ---------------------------------------------------------------------------
// One writer at a time. Shared across Next's duplicated module copies.
// ---------------------------------------------------------------------------

const LOCK_KEY = Symbol.for("ahd.singleplayer.saves.lock");

function withSaveLock<T>(task: () => Promise<T>): Promise<T> {
  const store = globalThis as typeof globalThis & { [LOCK_KEY]?: Promise<unknown> };
  const run = (store[LOCK_KEY] ?? Promise.resolve()).then(task, task);
  store[LOCK_KEY] = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

function parseMeta(raw: unknown, id: string): SaveMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<SaveMeta>;
  if (m.id !== id || typeof m.name !== "string" || typeof m.createdAt !== "string") return null;
  if (m.kind !== "manual" && m.kind !== "auto" && m.kind !== "safety") return null;
  return {
    id,
    kind: m.kind,
    name: m.name,
    turn: typeof m.turn === "number" ? m.turn : null,
    preset: typeof m.preset === "string" ? m.preset : null,
    mode: typeof m.mode === "string" ? m.mode : null,
    characterName: typeof m.characterName === "string" ? m.characterName : null,
    createdAt: m.createdAt,
    sizeBytes: typeof m.sizeBytes === "number" ? m.sizeBytes : 0,
  };
}

/** Newest first. A save still being written lives in a temporary folder and is never listed. */
export async function listSaves(home: string = singleplayerHomeDir()): Promise<SaveMeta[]> {
  const dir = savesDir(home);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const saves: SaveMeta[] = [];
  for (const entry of entries) {
    if (!isSaveId(entry)) continue;
    const meta = parseMeta(await readJson(path.join(dir, entry, META_FILE)), entry);
    if (meta && existsSync(path.join(dir, entry, ARCHIVE_FILE))) saves.push(meta);
  }
  return saves.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function getSave(
  id: string,
  home: string = singleplayerHomeDir()
): Promise<SaveMeta | null> {
  if (!isSaveId(id)) return null;
  const meta = parseMeta(await readJson(path.join(savesDir(home), id, META_FILE)), id);
  return meta && existsSync(path.join(savesDir(home), id, ARCHIVE_FILE)) ? meta : null;
}

export async function deleteSave(
  id: string,
  home: string = singleplayerHomeDir()
): Promise<boolean> {
  if (!isSaveId(id)) return false;
  return withSaveLock(async () => {
    const dir = path.join(savesDir(home), id);
    if (!existsSync(dir)) return false;
    // Never delete the save a load is waiting on.
    const marker = await readJson<{ saveId?: string }>(path.join(home, RESTORE_MARKER_FILE));
    if (marker?.saveId === id) throw new SaveError(409, "That save is about to be loaded.");
    await rm(dir, { recursive: true, force: true });
    return true;
  });
}

export class SaveError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SaveError";
  }
}

// ---------------------------------------------------------------------------
// Settings and state
// ---------------------------------------------------------------------------

export async function readSaveSettings(
  home: string = singleplayerHomeDir()
): Promise<SaveSettings> {
  const raw = await readJson<Partial<SaveSettings>>(path.join(savesDir(home), SETTINGS_FILE));
  const every = raw?.autosaveEvery;
  return {
    autosaveEvery:
      typeof every === "number" &&
      Number.isInteger(every) &&
      every >= 0 &&
      every <= MAX_AUTOSAVE_INTERVAL
        ? every
        : DEFAULT_AUTOSAVE_INTERVAL,
  };
}

export async function writeSaveSettings(
  settings: SaveSettings,
  home: string = singleplayerHomeDir()
): Promise<SaveSettings> {
  const every = settings.autosaveEvery;
  if (!Number.isInteger(every) || every < 0 || every > MAX_AUTOSAVE_INTERVAL)
    throw new SaveError(
      400,
      `Autosave interval must be a whole number from 0 to ${MAX_AUTOSAVE_INTERVAL}.`
    );
  await writeJsonAtomic(path.join(savesDir(home), SETTINGS_FILE), { autosaveEvery: every });
  return { autosaveEvery: every };
}

export async function readSaveState(home: string = singleplayerHomeDir()): Promise<SaveState> {
  return (await readJson<SaveState>(path.join(savesDir(home), STATE_FILE))) ?? {};
}

async function patchSaveState(patch: SaveState, home: string): Promise<void> {
  const next = { ...(await readSaveState(home)), ...patch };
  await writeJsonAtomic(path.join(savesDir(home), STATE_FILE), next).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Creating saves
// ---------------------------------------------------------------------------

interface WorldFacts {
  turn: number | null;
  preset: string | null;
  mode: string | null;
  characterName: string | null;
  processing: boolean;
}

async function readWorldFacts(db: Db): Promise<WorldFacts | null> {
  const state = await db
    .collection<{
      _id: string;
      currentTurn?: number;
      preset?: string;
      isProcessing?: boolean;
      singleplayerConfig?: { mode?: string };
    }>("gameState")
    .findOne(
      { _id: "current" },
      { projection: { currentTurn: 1, preset: 1, isProcessing: 1, singleplayerConfig: 1 } }
    );
  if (!state) return null;
  const character = await db
    .collection("characters")
    .findOne(
      { userId: new ObjectId(SINGLEPLAYER_USER_ID), retiredAt: { $exists: false } },
      { projection: { name: 1 } }
    );
  return {
    turn: typeof state.currentTurn === "number" ? state.currentTurn : null,
    preset: typeof state.preset === "string" ? state.preset : null,
    mode: state.singleplayerConfig?.mode ?? null,
    characterName: typeof character?.name === "string" ? character.name : null,
    processing: state.isProcessing === true,
  };
}

async function writeSave(
  db: Db,
  home: string,
  kind: SaveKind,
  name: string,
  facts: WorldFacts
): Promise<SaveMeta> {
  const root = savesDir(home);
  const id = newSaveId();
  const tmp = path.join(root, `.tmp-${id}`);
  await mkdir(root, { recursive: true });
  // Writers hold the save lock, so any temporary folder still here is left
  // over from a save that was cut off (the world was stopped mid-save).
  for (const entry of await readdir(root).catch(() => [] as string[]))
    if (entry.startsWith(".tmp-"))
      await rm(path.join(root, entry), { recursive: true, force: true }).catch(() => undefined);
  await mkdir(tmp, { recursive: true });
  try {
    await writeSaveArchive(db, path.join(tmp, ARCHIVE_FILE));
    const { size } = await stat(path.join(tmp, ARCHIVE_FILE));
    const meta: SaveMeta = {
      id,
      kind,
      name,
      turn: facts.turn,
      preset: facts.preset,
      mode: facts.mode,
      characterName: facts.characterName,
      createdAt: new Date().toISOString(),
      sizeBytes: size,
    };
    await writeFile(path.join(tmp, META_FILE), JSON.stringify(meta, null, 2));
    await rename(tmp, path.join(root, id));
    return meta;
  } catch (error) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function prune(kind: SaveKind, keep: number, home: string): Promise<void> {
  const same = (await listSaves(home)).filter((save) => save.kind === kind);
  for (const old of same.slice(keep)) {
    await rm(path.join(savesDir(home), old.id), { recursive: true, force: true }).catch(
      () => undefined
    );
  }
}

/** A named save at the player's request. Refused while a turn is running. */
export function createManualSave(
  db: Db,
  rawName: unknown,
  home: string = singleplayerHomeDir()
): Promise<SaveMeta> {
  return withSaveLock(async () => {
    const facts = await readWorldFacts(db);
    if (!facts) throw new SaveError(409, "There is no world to save yet.");
    if (facts.processing)
      throw new SaveError(409, "A turn is running. Save again when it finishes.");
    const name = cleanSaveName(rawName) || `Turn ${facts.turn ?? 0}`;
    return writeSave(db, home, "manual", name, facts);
  });
}

/**
 * Autosave when the turn counter has moved `autosaveEvery` turns past the last
 * autosave. Counting from the last autosave (not turn % N) keeps a batch of
 * turns, a paused stretch or a loaded older save from skipping a save.
 * Fire-and-forget by design: a turn never waits on, or fails because of, a
 * save. A failure is recorded for the saves list instead.
 */
export function maybeAutosave(
  db: Db,
  turn: number,
  home: string = singleplayerHomeDir()
): Promise<SaveMeta | null> {
  return withSaveLock(async () => {
    try {
      const { autosaveEvery } = await readSaveSettings(home);
      if (autosaveEvery <= 0) return null;
      const last = (await listSaves(home)).find((save) => save.kind === "auto");
      if (last?.turn != null && turn >= last.turn && turn - last.turn < autosaveEvery) return null;
      const facts = await readWorldFacts(db);
      if (!facts || facts.processing) return null;
      const meta = await writeSave(db, home, "auto", `Autosave, turn ${facts.turn ?? turn}`, facts);
      await prune("auto", AUTOSAVES_KEPT, home);
      if ((await readSaveState(home)).lastAutosaveError)
        await patchSaveState({ lastAutosaveError: null }, home);
      return meta;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[singleplayer-saves] autosave failed:", message);
      await patchSaveState({ lastAutosaveError: { at: new Date().toISOString(), message } }, home);
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Loading saves
// ---------------------------------------------------------------------------

/**
 * Ask for a save to be loaded the next time the world starts. The caller
 * restarts the world; nothing in the live database changes here.
 */
export async function requestLoad(
  id: string,
  home: string = singleplayerHomeDir()
): Promise<SaveMeta> {
  const meta = await getSave(id, home);
  if (!meta) throw new SaveError(404, "That save no longer exists.");
  await writeJsonAtomic(path.join(home, RESTORE_MARKER_FILE), {
    saveId: id,
    requestedAt: new Date().toISOString(),
  });
  return meta;
}

async function restoreFrom(db: Db, home: string, meta: SaveMeta): Promise<void> {
  const file = path.join(savesDir(home), meta.id, ARCHIVE_FILE);
  await verifySaveArchive(file);
  await restoreSaveArchive(db, file);
}

const RESTORE_KEY = Symbol.for("ahd.singleplayer.saves.restore");

/**
 * Applies a requested load, before anyone is let into the world. The player's
 * current state is saved first (one "before loading" save is kept), the target
 * is verified end to end before anything is dropped, and if the restore itself
 * fails the previous state is put back. Resolves to the outcome, or null when
 * no load was waiting.
 */
export function applyPendingRestore(
  db: Db,
  home: string = singleplayerHomeDir()
): Promise<SaveOutcome | null> {
  const store = globalThis as typeof globalThis & { [RESTORE_KEY]?: Promise<SaveOutcome | null> };
  if (!existsSync(path.join(home, RESTORE_MARKER_FILE))) return Promise.resolve(null);
  store[RESTORE_KEY] ??= withSaveLock(() => runPendingRestore(db, home)).finally(() => {
    store[RESTORE_KEY] = undefined;
  });
  return store[RESTORE_KEY];
}

async function runPendingRestore(db: Db, home: string): Promise<SaveOutcome | null> {
  const markerFile = path.join(home, RESTORE_MARKER_FILE);
  const marker = await readJson<{ saveId?: string }>(markerFile);
  const done = async (outcome: SaveOutcome) => {
    await patchSaveState({ lastRestore: outcome }, home);
    await rm(markerFile, { force: true });
    return outcome;
  };
  const at = () => new Date().toISOString();

  const target = marker?.saveId ? await getSave(marker.saveId, home) : null;
  if (!target) {
    return done({
      at: at(),
      ok: false,
      message: "The save you asked for is gone, so nothing was loaded.",
    });
  }
  console.log(`[singleplayer-saves] loading "${target.name}" (turn ${target.turn ?? "?"})`);
  try {
    await verifySaveArchive(path.join(savesDir(home), target.id, ARCHIVE_FILE));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return done({
      at: at(),
      ok: false,
      saveName: target.name,
      message: `That save could not be loaded and your world is unchanged. ${reason}`,
    });
  }

  let before: SaveMeta | null = null;
  const facts = await readWorldFacts(db).catch(() => null);
  if (facts) {
    try {
      before = await writeSave(db, home, "safety", `Before loading ${target.name}`.slice(0, 80), {
        ...facts,
        processing: false,
      });
      await prune("safety", SAFETY_SAVES_KEPT, home);
    } catch (error) {
      console.error("[singleplayer-saves] could not save the current state first:", error);
    }
  }

  const started = Date.now();
  try {
    await restoreFrom(db, home, target);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[singleplayer-saves] restore failed:", reason);
    if (before) {
      try {
        await restoreFrom(db, home, before);
        return done({
          at: at(),
          ok: false,
          saveName: target.name,
          message: `Loading failed, so your world was put back as it was. ${reason}`,
        });
      } catch (rollbackError) {
        console.error("[singleplayer-saves] rollback failed:", rollbackError);
      }
    }
    return done({
      at: at(),
      ok: false,
      saveName: target.name,
      message: `Loading failed part way. Load "${before?.name ?? "another save"}" from your saves to recover. ${reason}`,
    });
  }
  console.log(`[singleplayer-saves] loaded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return done({
    at: at(),
    ok: true,
    saveName: target.name,
    message: `Loaded "${target.name}".`,
  });
}
