import type { Front, StatObj } from "../combat";

/** Seeded mulberry32 stream; every battle roll draws from one so a seed replays exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EnemyUnit {
  id: string;
  name: string;
  icon: string;
  domain: string;
  traits: string[];
  s: StatObj;
  cv: number;
}

const ENEMY_KIND: Record<
  string,
  { icon: string; domain: string; t: string[]; s: StatObj; names: string[] }
> = {
  armor: {
    icon: "tank",
    domain: "ground",
    t: ["armored", "antiarmor"],
    s: { fp: 74, ar: 88, sh: 86, mo: 62, mb: 55, rn: 25, aa: 20, rc: 35 },
    names: ["Guards Tank Regiment", "Heavy Armor Bde", "Armor Division"],
  },
  mech: {
    icon: "tank",
    domain: "ground",
    t: ["armored", "rapid"],
    s: { fp: 64, ar: 68, sh: 66, mo: 60, mb: 74, rn: 28, aa: 32, rc: 45 },
    names: ["Motor Rifle Division", "Mechanized Bde"],
  },
  infantry: {
    icon: "soldier",
    domain: "ground",
    t: ["allweather", "recon"],
    s: { fp: 50, ar: 40, sh: 46, mo: 58, mb: 42, rn: 30, aa: 26, rc: 50 },
    names: ["Infantry Brigade", "Militia Column", "Airborne Bde"],
  },
  arty: {
    icon: "artillery",
    domain: "ground",
    t: ["longrange", "antiarmor"],
    s: { fp: 90, ar: 30, sh: 42, mo: 55, mb: 35, rn: 88, aa: 10, rc: 32 },
    names: ["Rocket Artillery Bde", "Artillery Group"],
  },
  air: {
    icon: "jet",
    domain: "air",
    t: ["antiair", "rapid"],
    s: { fp: 86, ar: 30, sh: 80, mo: 65, mb: 96, rn: 82, aa: 88, rc: 76 },
    names: ["Air Regiment", "Fighter Wing", "Air Assault Bde"],
  },
  airdef: {
    icon: "missile",
    domain: "air",
    t: ["antiair"],
    s: { fp: 42, ar: 40, sh: 34, mo: 58, mb: 52, rn: 74, aa: 95, rc: 60 },
    names: ["Air Defense Corps", "SAM Regiment"],
  },
  missile: {
    icon: "missile",
    domain: "rocket",
    t: ["longrange", "strategic"],
    s: { fp: 92, ar: 32, sh: 82, mo: 55, mb: 45, rn: 95, aa: 8, rc: 52 },
    names: ["Missile Battalion", "Rocket Brigade"],
  },
  naval: {
    icon: "ship",
    domain: "naval",
    t: ["antiair", "longrange"],
    s: { fp: 72, ar: 55, sh: 58, mo: 62, mb: 68, rn: 80, aa: 70, rc: 66 },
    names: ["Destroyer Flotilla", "Naval Squadron"],
  },
};
/** Fallback enemy composition when a front carries no `enemyMix` of its own. */
const DEFAULT_ENEMY_MIX = ["mech", "infantry", "arty"];

/** Deterministic enemy force generator for a front (design buildEnemy). */
export function buildEnemy(front: Front, seed: number): EnemyUnit[] {
  const r = rng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const mix = front.enemyMix ?? DEFAULT_ENEMY_MIX;
  const count = 3 + Math.floor(r() * 2);
  const arr: EnemyUnit[] = [];
  for (let i = 0; i < count; i++) {
    const k = ENEMY_KIND[mix[Math.floor(r() * mix.length)]];
    const grade = 0.85 + r() * 0.4;
    const s = {} as StatObj;
    for (const key in k.s) {
      const kk = key as keyof StatObj;
      s[kk] = Math.max(3, Math.min(100, Math.round(k.s[kk] * (kk === "mo" ? 1 : grade))));
    }
    arr.push({
      id: "e" + i,
      name: pick(k.names),
      icon: k.icon,
      domain: k.domain,
      traits: k.t,
      s,
      cv: Math.round((45 + r() * 75) * grade),
    });
  }
  return arr;
}
