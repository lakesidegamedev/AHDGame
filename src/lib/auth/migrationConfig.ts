const CONTROL = /[\u0000-\u001f\u007f]/u;
const SECRET = /^[A-Za-z0-9._~+/-]+=*$/u;

const DEFAULT_MIGRATION_SOURCE_ISSUER = "urn:lakeside:legacy:ahd:production";

export function migrationRoutesEnabled(name: string): boolean {
  return process.env[name] === "true";
}

export function migrationSourceIssuer(): string {
  const value = process.env.AHD_MIGRATION_SOURCE_ISSUER ?? DEFAULT_MIGRATION_SOURCE_ISSUER;
  if (value.length < 1 || value.length > 512 || value.trim() !== value || CONTROL.test(value)) {
    throw new Error("Invalid AHD_MIGRATION_SOURCE_ISSUER");
  }
  return value;
}

export function migrationProofLoadSecret(): string {
  const value = process.env.AHD_MIGRATION_PROOF_LOAD_SECRET;
  if (typeof value !== "string" || value.length < 32 || value.length > 512 || !SECRET.test(value)) {
    throw new Error("Invalid AHD_MIGRATION_PROOF_LOAD_SECRET");
  }
  return value;
}
