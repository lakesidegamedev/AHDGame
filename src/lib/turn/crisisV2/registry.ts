import type { Db } from "mongodb";
import {
  createEffectRegistry,
  type EffectModule,
  type EffectModuleRegistry,
} from "@/lib/crises/v2/effectModule";
import type { OfficeHolders } from "@/lib/crises/v2/accountability";
import type { DirectorCandidate } from "@/lib/crises/v2/director";
import type { CrisisDefinition } from "@/lib/crises/v2/types";

/** What an input provider needs to read the sim for the crises in play. */
export interface CrisisInputContext {
  db: Db;
  turn: number;
  countryIds: ReadonlySet<string>;
  stateIdsByCountry: ReadonlyMap<string, readonly string[]>;
}

/**
 * Fills one driver input. `input` matches `CrisisDriverDef.input`. Returns a
 * value per country, read in bulk; countries with no reading are omitted and a
 * crisis averages over the countries it covers that do have one.
 */
export interface CrisisInputProvider {
  input: string;
  load(ctx: CrisisInputContext): Promise<Map<string, number>>;
}

export interface CrisisHolderContext {
  db: Db;
  turn: number;
  countryIds: ReadonlySet<string>;
}

/** Office holders per country for the roles this provider knows. */
export interface CrisisHolderProvider {
  id: string;
  load(ctx: CrisisHolderContext): Promise<Map<string, OfficeHolders>>;
}

/** An opening a detector or scheduler asks the director to approve. */
export interface CrisisOpenCandidate extends DirectorCandidate {
  regionIds: readonly string[];
}

export interface CrisisOpenCandidateContext {
  db: Db;
  turn: number;
}

export interface CrisisOpenCandidateProvider {
  id: string;
  load(ctx: CrisisOpenCandidateContext): Promise<CrisisOpenCandidate[]>;
}

const definitions = new Map<string, CrisisDefinition>();
const inputProviders = new Map<string, CrisisInputProvider>();
const holderProviders = new Map<string, CrisisHolderProvider>();
const candidateProviders = new Map<string, CrisisOpenCandidateProvider>();
const effectModules = new Map<string, EffectModule>();

export function registerCrisisDefinition(def: CrisisDefinition): void {
  definitions.set(def.id, def);
}

export function getCrisisDefinition(id: string): CrisisDefinition | undefined {
  return definitions.get(id);
}

export function registerCrisisInputProvider(provider: CrisisInputProvider): void {
  inputProviders.set(provider.input, provider);
}

export function getCrisisInputProvider(input: string): CrisisInputProvider | undefined {
  return inputProviders.get(input);
}

export function registerCrisisHolderProvider(provider: CrisisHolderProvider): void {
  holderProviders.set(provider.id, provider);
}

export function listCrisisHolderProviders(): CrisisHolderProvider[] {
  return [...holderProviders.values()];
}

export function registerCrisisOpenCandidateProvider(provider: CrisisOpenCandidateProvider): void {
  candidateProviders.set(provider.id, provider);
}

export function listCrisisOpenCandidateProviders(): CrisisOpenCandidateProvider[] {
  return [...candidateProviders.values()];
}

export function registerCrisisEffectModule(mod: EffectModule): void {
  effectModules.set(mod.id, mod);
}

export function getCrisisEffectRegistry(): EffectModuleRegistry {
  return createEffectRegistry([...effectModules.values()]);
}

/** Test seam: clears everything registered by content or built-ins. */
export function resetCrisisV2RegistryForTests(): void {
  definitions.clear();
  inputProviders.clear();
  holderProviders.clear();
  candidateProviders.clear();
  effectModules.clear();
}
