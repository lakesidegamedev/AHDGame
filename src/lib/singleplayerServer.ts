import { existsSync } from "fs";
import os from "os";
import path from "path";
import { ObjectId, type Db } from "mongodb";
import { SINGLEPLAYER_USER_ID, singleplayerSessionClaims } from "@/lib/singleplayer";
import { CDN_GEO } from "@/lib/images/cdnUrls";
import { DEFAULT_GAME_STATE_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";
import { invalidateMaintenanceCache } from "@/lib/maintenanceStatus";
import type {
  GameState,
  GameConfig,
  NppAutonomyLevel,
  SingleplayerConfig,
  SingleplayerDifficulty,
  SingleplayerMode,
} from "@/lib/db/types";
import { reconcileSingleplayerHeadOfState } from "@/lib/singleplayerHeadOfState";
import { promoteSingleplayerOwnerIfNoAdmin } from "@/lib/singleplayerOwnerAdmin";
import { runRequiredStartupMigrations } from "@/lib/migrations/startupMigrations";
import {
  migrateSingleplayerWorld,
  stampSingleplayerBaseline,
} from "@/lib/migrations/singleplayerMigrations";

/**
 * Node-only singleplayer helpers. `@/lib/singleplayer` must stay importable
 * from the Edge runtime (the proxy mints the session there), so anything that
 * touches the filesystem or the database lives here instead.
 */

/**
 * Where a singleplayer install keeps everything that outlives a session: the
 * MongoDB data directory, the downloaded server binary and the CDN mirror.
 * The launcher sets `SINGLEPLAYER_HOME`; the default matches what it uses
 * when nothing is configured so both sides agree without coordination.
 */
export function singleplayerHomeDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.SINGLEPLAYER_HOME?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".a-house-divided");
}

/** Written by a save-load request; the next start of the world applies it. */
export const RESTORE_MARKER_FILE = "restore-pending.json";

export function hasPendingRestore(env: Record<string, string | undefined> = process.env): boolean {
  return existsSync(path.join(singleplayerHomeDir(env), RESTORE_MARKER_FILE));
}

export function singleplayerCdnDir(env: Record<string, string | undefined> = process.env): string {
  return path.join(singleplayerHomeDir(env), "cdn");
}

/**
 * Creates the one local account if it does not exist yet. Idempotent, so it
 * is safe to call on every launch and after every world reset (a full reset
 * deletes non-admin users; the doc mirrors the session's admin claim so the
 * two never disagree about who this player is).
 */
export async function ensureSingleplayerUser(
  db: Db,
  displayName = "Admin"
): Promise<{ created: boolean }> {
  const users = db.collection("users");
  const _id = new ObjectId(SINGLEPLAYER_USER_ID);
  const claims = singleplayerSessionClaims();
  const now = new Date();
  const result = await users.updateOne(
    { _id },
    {
      $set: { role: claims.role, isAdmin: claims.isAdmin },
      $setOnInsert: {
        _id,
        email: claims.email,
        username: claims.username,
        displayName,
        // Never a valid hash: the proxy mints the session, nobody logs in.
        password: "!singleplayer-no-login",
        hasCompletedSetup: false,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
        lastActivity: now,
      },
    },
    { upsert: true }
  );
  return { created: result.upsertedCount === 1 };
}

export interface SingleplayerStatus {
  singleplayer: true;
  accountCreated: boolean;
  hasWorld: boolean;
  turn: number | null;
  preset: string | null;
  turnInProgress: boolean;
  hasCharacter: boolean;
  characterName: string | null;
  mode: SingleplayerMode | null;
  setup: {
    mode: SingleplayerMode;
    difficulty: SingleplayerDifficulty;
    autonomyLevel: NppAutonomyLevel;
    permanentHeadOfState: boolean;
    featureFlags: Record<string, boolean>;
  } | null;
  permanentHeadOfState: boolean;
  playerless: boolean;
  spectatorPath: "/singleplayer/worldsim";
  /** Map files the globe cannot render without; the launcher pre-warms these. */
  warmAssets: string[];
}

async function clearSingleplayerMaintenance(db: Db): Promise<void> {
  const result = await db.collection<GameConfig>("gameConfig").updateOne(
    { _id: "default", maintenanceMode: { $ne: "off" } },
    {
      $set: { maintenanceMode: "off" },
      $unset: {
        maintenanceReason: "",
        maintenanceExpectedEnd: "",
        maintenanceEnabledBy: "",
        maintenanceEnabledAt: "",
      },
    }
  );
  if (result.modifiedCount > 0) invalidateMaintenanceCache();
}

/**
 * What the launcher and the /singleplayer screen need to choose between
 * "new game" and "continue". Provisions the local account on first contact,
 * so a fresh database is playable the moment the server answers.
 */
export async function singleplayerStatus(db: Db): Promise<SingleplayerStatus> {
  // A requested save load is applied first, so the migration pass below brings
  // an older save up to this build exactly as it does for any older world.
  // Imported lazily: the saves module reads this file's home directory.
  if (hasPendingRestore()) {
    const { applyPendingRestore } = await import("@/lib/singleplayer/saves");
    await applyPendingRestore(db);
  }
  await ensureSingleplayerWorldMigrated(db);
  const account = await ensureSingleplayerUser(db);
  // Existing worlds predate owner-admin: promote the earliest account when
  // nobody holds admin, next to the head-of-state repair below.
  await promoteSingleplayerOwnerIfNoAdmin(db);
  await clearSingleplayerMaintenance(db);
  const userId = new ObjectId(SINGLEPLAYER_USER_ID);
  const [gameState, character, characterCount] = await Promise.all([
    db
      .collection<GameState>("gameState")
      .findOne(
        { _id: "current" },
        { projection: { currentTurn: 1, preset: 1, isProcessing: 1, singleplayerConfig: 1 } }
      ),
    db
      .collection("characters")
      .findOne({ userId, retiredAt: { $exists: false } }, { projection: { _id: 1, name: 1 } }),
    db.collection("characters").countDocuments({ retiredAt: { $exists: false } }),
  ]);
  const config = gameState?.singleplayerConfig;
  if (config?.mode === "head-of-state") {
    await reconcileSingleplayerHeadOfState(db, { preset: gameState?.preset });
  }
  return {
    singleplayer: true,
    accountCreated: account.created,
    hasWorld: Boolean(gameState),
    turn: typeof gameState?.currentTurn === "number" ? gameState.currentTurn : null,
    preset: typeof gameState?.preset === "string" ? gameState.preset : null,
    turnInProgress: gameState?.isProcessing === true,
    hasCharacter: Boolean(character),
    characterName: typeof character?.name === "string" ? character.name : null,
    mode: config?.mode ?? null,
    setup: config
      ? {
          mode: config.mode,
          difficulty: config.difficulty,
          autonomyLevel: config.nppAutonomyLevel,
          permanentHeadOfState: config.permanentHeadOfState,
          featureFlags: config.featureFlags,
        }
      : null,
    permanentHeadOfState: config?.permanentHeadOfState === true,
    playerless: characterCount === 0,
    spectatorPath: "/singleplayer/worldsim",
    warmAssets: Object.values(CDN_GEO).sort(),
  };
}

export async function setSingleplayerConfig(
  db: Db,
  config: Omit<SingleplayerConfig, "configuredAt" | "featureFlags"> & {
    featureFlags?: Record<string, boolean>;
  }
): Promise<SingleplayerConfig> {
  const defaults = Object.fromEntries(
    Object.entries(DEFAULT_GAME_STATE_FLAGS).filter(
      ([key, value]) => key !== "nppAutonomyEnabled" && typeof value === "boolean"
    )
  ) as Record<string, boolean>;
  const featureFlags = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, config.featureFlags?.[key] ?? defaults[key]])
  ) as Record<string, boolean>;
  const persisted: SingleplayerConfig = { ...config, featureFlags, configuredAt: new Date() };
  await db.collection<GameState>("gameState").updateOne(
    { _id: "current" },
    {
      $set: {
        singleplayerConfig: persisted,
        // A local player owns turn pacing. Mark the world ready rather than
        // paused, but never advertise a hosted cron deadline that cannot fire
        // in the local runtime.
        isActive: true,
        pausedAt: null,
        pauseReason: null,
        pauseKind: null,
        nextScheduledTurn: null,
        nppAutonomyLevel: persisted.nppAutonomyLevel,
        nppAutonomyEnabled: persisted.nppAutonomyLevel !== "off",
        ...featureFlags,
        updatedAt: persisted.configuredAt,
      },
    }
  );
  await clearSingleplayerMaintenance(db);
  return persisted;
}

export async function getSingleplayerConfig(db: Db): Promise<SingleplayerConfig | null> {
  const state = await db
    .collection<GameState>("gameState")
    .findOne({ _id: "current" }, { projection: { singleplayerConfig: 1 } });
  return state?.singleplayerConfig ?? null;
}

/**
 * Runs the required startup migrations after a local world reset, then stamps
 * the world current with this build.
 *
 * A hosted reset is followed by a server restart, and startup applies these
 * (the opening 1991 bond pools only exist at turn 1 of a fresh 1991 world, and
 * index metadata can disappear on reset). A local "New game" keeps the same
 * server running, so it applies them here before the first turn.
 */
export async function applyStartupRepairsAfterReset(
  db: Db,
  log: (line: string) => void = () => {}
): Promise<string[]> {
  const summary = await runRequiredStartupMigrations(db);
  for (const id of summary.ranIds) {
    log(`[startup-migrations] ${id}`);
  }
  // The world was just seeded by this build, so it is current with every
  // migration the build knows; a later build applies only newer ones.
  await stampSingleplayerBaseline(db);
  return summary.ranIds;
}

// One pass per server process, shared across Next's duplicated module copies.
const MIGRATED_KEY = Symbol.for("ahd.singleplayer.worldMigrated");

/**
 * Applies pending migrations to the local world once per server start. The
 * launcher waits on the status route before it reports ready, so this
 * finishes before the player is let in. A failure is logged and the world
 * still opens: the failed migration stays pending and retries next start.
 */
export function ensureSingleplayerWorldMigrated(db: Db): Promise<void> {
  const store = globalThis as typeof globalThis & { [MIGRATED_KEY]?: Promise<void> };
  store[MIGRATED_KEY] ??= migrateSingleplayerWorld(db).then(
    (summary) => {
      if (summary && summary.ranIds.length > 0) {
        console.log(`[singleplayer-migrations] ran=${summary.ranIds.join(",")}`);
      }
    },
    (error: unknown) => {
      console.error(
        "[singleplayer-migrations] failed; the world opens and retries next start:",
        error instanceof Error ? (error.stack ?? error.message) : error
      );
    }
  );
  return store[MIGRATED_KEY];
}
