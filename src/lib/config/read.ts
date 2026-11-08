/**
 * The one place server code reads the process environment.
 *
 * Accessors read on every call rather than caching, so tests that stub a
 * variable and deployments that inject secrets after module load both see the
 * current value. Each accessor uses a literal `process.env.NAME` so bundlers
 * can still inline values where they do.
 */

export type EnvSource = Record<string, string | undefined>;

/** The live environment, for functions that accept an injectable env. */
export function serverEnv(): NodeJS.ProcessEnv {
  return process.env;
}

/** A variable whose name is only known at runtime. */
export function readEnv(name: string): string | undefined {
  return process.env[name];
}
