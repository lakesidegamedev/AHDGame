import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { ActionRecommendation } from "@/lib/actions/recommendations";
import { ACTION_HOARDING_THRESHOLD } from "@/lib/actions/recommendationsConstants";
import {
  BOND_LEVELS,
  type AdviceTone,
  type KeirAdvice,
  type KeirPetWidgetData,
} from "./keirPetShared";

export { BOND_LEVELS, type AdviceTone, type KeirAdvice, type KeirPetWidgetData };

/** Keir writes a fresh tip at most this often. */
export const ADVICE_TTL_MS = 12 * 60 * 60_000;
/** Tea once every four hours; pats every ten minutes. */
export const TEA_COOLDOWN_MS = 4 * 60 * 60_000;
export const PAT_COOLDOWN_MS = 10 * 60_000;
const BOND_FOR_TEA = 3;
const BOND_FOR_PAT = 1;
const BOND_FOR_DAILY_VISIT = 2;

/** Stored on the account as `users.keirPet`. */
export interface KeirPetState {
  bond: number;
  streak: number;
  /** UTC day (YYYY-MM-DD) of the last visit, for the streak. */
  lastVisitDay?: string;
  teaAt?: Date;
  patAt?: Date;
  advice?: KeirAdvice;
}

/** Evergreen tips, used when nothing about the player stands out. Kept strictly true. */
const EVERGREEN: Array<Omit<KeirAdvice, "generatedAt">> = [
  {
    id: "tip-actions-page",
    title: "Start each visit on Actions",
    why: "It lists everything you can do this turn and what each costs, so nothing slips.",
    link: "/actions",
    tone: "chat",
  },
  {
    id: "tip-hoarding",
    title: "Spend points before they pile up",
    why: `Above ${ACTION_HOARDING_THRESHOLD} action points, your gain each turn shrinks.`,
    link: "/actions",
    tone: "chat",
  },
  {
    id: "tip-notifications",
    title: "Clear your notifications",
    why: "Votes, offers and results land there first.",
    link: "/notifications",
    tone: "chat",
  },
  {
    id: "tip-ask",
    title: "Ask me about any page",
    why: "Open the Ask Keir tab and I will explain what you are looking at, with sources.",
    link: null,
    tone: "chat",
  },
];

const TONE_BY_PRIORITY: Record<ActionRecommendation["priority"], AdviceTone> = {
  critical: "warn",
  high: "nudge",
  medium: "idea",
  low: "idea",
};
const PRIORITY_ORDER: ActionRecommendation["priority"][] = ["critical", "high", "medium", "low"];

/**
 * One tip from the player's own recommendations, most urgent first, avoiding
 * the last tip when there is another. Falls back to an evergreen tip.
 */
export function chooseAdvice(
  recommendations: ActionRecommendation[],
  previousId: string | undefined,
  now: Date
): KeirAdvice {
  const ranked = [...recommendations].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );
  const pick = ranked.find((rec) => rec.id !== previousId) ?? ranked[0];
  if (pick && (pick.id !== previousId || ranked.length === 1)) {
    return {
      id: pick.id,
      title: pick.title,
      why: pick.why,
      link: pick.link || null,
      tone: TONE_BY_PRIORITY[pick.priority],
      generatedAt: now.toISOString(),
    };
  }
  const pool = EVERGREEN.filter((tip) => tip.id !== previousId);
  const tip = pool[Math.floor(now.getTime() / ADVICE_TTL_MS) % pool.length]!;
  return { ...tip, generatedAt: now.toISOString() };
}

export function heartsFor(bond: number): { hearts: number; nextHeartAt: number | null } {
  const hearts = BOND_LEVELS.filter((needed) => bond >= needed).length;
  return { hearts, nextHeartAt: BOND_LEVELS[hearts] ?? null };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Visiting on consecutive days grows the streak; a missed day restarts it. */
export function registerVisit(state: KeirPetState, now: Date): KeirPetState {
  const today = utcDay(now);
  if (state.lastVisitDay === today) return state;
  const yesterday = utcDay(new Date(now.getTime() - 24 * 60 * 60_000));
  return {
    ...state,
    lastVisitDay: today,
    streak: state.lastVisitDay === yesterday ? state.streak + 1 : 1,
    bond: state.bond + BOND_FOR_DAILY_VISIT,
  };
}

function readState(raw: unknown): KeirPetState {
  const value = (raw ?? {}) as Partial<KeirPetState>;
  return {
    bond: Number.isFinite(value.bond) ? Math.max(0, value.bond!) : 0,
    streak: Number.isFinite(value.streak) ? Math.max(0, value.streak!) : 0,
    lastVisitDay: typeof value.lastVisitDay === "string" ? value.lastVisitDay : undefined,
    teaAt: value.teaAt instanceof Date ? value.teaAt : undefined,
    patAt: value.patAt instanceof Date ? value.patAt : undefined,
    advice: value.advice && typeof value.advice.title === "string" ? value.advice : undefined,
  };
}

function readyAt(at: Date | undefined, cooldown: number, now: Date): string | null {
  if (!at) return null;
  const ready = at.getTime() + cooldown;
  return ready > now.getTime() ? new Date(ready).toISOString() : null;
}

export function toWidgetData(state: KeirPetState, now: Date): KeirPetWidgetData {
  return {
    advice: state.advice ?? chooseAdvice([], undefined, now),
    bond: state.bond,
    ...heartsFor(state.bond),
    streak: state.streak,
    teaReadyAt: readyAt(state.teaAt, TEA_COOLDOWN_MS, now),
    patReadyAt: readyAt(state.patAt, PAT_COOLDOWN_MS, now),
  };
}

export type LoadRecommendations = (
  db: Db,
  userId: string
) => Promise<{ recommendations: ActionRecommendation[] }>;

/**
 * The pet as the player left it, with today's visit counted and a new tip if
 * the last one is over 12 hours old. Writes only when something changed.
 */
export async function loadKeirPet(
  db: Db,
  userId: string,
  loadRecommendations: LoadRecommendations,
  now = new Date()
): Promise<KeirPetWidgetData | null> {
  const users = db.collection<User>("users");
  const _id = new ObjectId(userId);
  const user = await users.findOne({ _id }, { projection: { keirPet: 1 } });
  if (!user) return null;
  const before = readState((user as { keirPet?: unknown }).keirPet);
  let state = registerVisit(before, now);
  const stale =
    !state.advice || now.getTime() - Date.parse(state.advice.generatedAt) >= ADVICE_TTL_MS;
  if (stale) {
    const { recommendations } = await loadRecommendations(db, userId).catch(() => ({
      recommendations: [] as ActionRecommendation[],
    }));
    state = { ...state, advice: chooseAdvice(recommendations, state.advice?.id, now) };
  }
  if (state !== before) {
    await users.updateOne({ _id }, { $set: { keirPet: state } as Record<string, unknown> });
  }
  return toWidgetData(state, now);
}

export type KeirPetAction = "tea" | "pat";

/** Tea or a pat, if Keir is ready for it. Returns null when still on cooldown. */
export async function careForKeir(
  db: Db,
  userId: string,
  action: KeirPetAction,
  now = new Date()
): Promise<KeirPetWidgetData | null> {
  const users = db.collection<User>("users");
  const _id = new ObjectId(userId);
  const user = await users.findOne({ _id }, { projection: { keirPet: 1 } });
  if (!user) return null;
  const state = readState((user as { keirPet?: unknown }).keirPet);
  const field = action === "tea" ? "teaAt" : "patAt";
  const cooldown = action === "tea" ? TEA_COOLDOWN_MS : PAT_COOLDOWN_MS;
  if (readyAt(state[field], cooldown, now)) return null;
  const cutoff = new Date(now.getTime() - cooldown);
  // Conditional on the cooldown so two quick clicks cannot both count.
  const result = await users.updateOne(
    {
      _id,
      $or: [
        { [`keirPet.${field}`]: { $exists: false } },
        { [`keirPet.${field}`]: { $lte: cutoff } },
      ],
    } as Record<string, unknown>,
    {
      $set: { [`keirPet.${field}`]: now },
      $inc: { "keirPet.bond": action === "tea" ? BOND_FOR_TEA : BOND_FOR_PAT },
    } as Record<string, unknown>
  );
  if (result.modifiedCount === 0) return null;
  const next = {
    ...state,
    [field]: now,
    bond: state.bond + (action === "tea" ? BOND_FOR_TEA : BOND_FOR_PAT),
  };
  return toWidgetData(next, now);
}
