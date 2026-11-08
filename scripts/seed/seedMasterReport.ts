/**
 * Master truth list of the seed and reset contracts, rendered as markdown:
 * every collection and what a reset does to it, every preserved field and its
 * action, and every dataset each preset must provide with its status.
 * Read-only; touches no database. `unclassified` is empty when every entry is
 * covered by a contract, and the CLI exits non-zero otherwise.
 *
 *   npx tsx scripts/seed/seedMasterReport.ts [output.md]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { SEED_PRESET_IDS, type SeedPresetId } from "../../src/lib/constants/turnTime";
import { SEED_MANIFEST } from "../../src/lib/admin/seed/seedManifest";
import { REFERENCE_REBUILD_KEPT_COLLECTIONS } from "../../src/lib/admin/seed/referenceRebuildClear";
import { RESIDUE_SCAN_RUNTIME_EXEMPT } from "../../src/lib/admin/resetContract/residueScan";
import { GAME_STATE_RESET_PRESERVED_FIELD_REASONS } from "../../src/lib/admin/resetGameWorld";
import {
  PRESERVED_COLLECTION_CONTRACT,
  type PreservedFieldRule,
} from "../../src/lib/admin/resetContract/rules/preservedFields";
import { checkSeedContract } from "../../src/lib/seeds/contract/checkSeedContract";
import {
  ERA_INVARIANT_DATASETS,
  PRESET_DATASETS,
  simulatesRegions,
} from "../../src/lib/seeds/contract/registry";
import { SEED_DATA_FILES } from "../../src/lib/seeds/contract/dataFiles";

export interface CollectionRow {
  name: string;
  category: string;
  action: string;
  reason: string;
}

export interface FieldRow {
  collection: string;
  field: string;
  action: PreservedFieldRule["action"];
  reason: string;
}

export type DatasetStatus = "provided" | "missing" | "optional" | "not simulated";

export interface DatasetRow {
  id: string;
  kind: "per-preset" | "era-invariant" | "data-file";
  reason: string;
  status: Partial<Record<SeedPresetId, DatasetStatus>>;
}

export interface MasterReport {
  collections: CollectionRow[];
  fields: FieldRow[];
  gameStateKept: Array<{ field: string; reason: string }>;
  datasets: DatasetRow[];
  contractGaps: Record<string, number>;
  /** Entries no contract classifies. Empty when the lists are complete. */
  unclassified: string[];
}

function declaredFields(file: string, typeName: string): string[] {
  const path = resolve(process.cwd(), file);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === typeName
  );
  if (!declaration) throw new Error(`${typeName} was not found in ${file}`);
  return declaration.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(source).replace(/\?$/, ""));
}

/** Declared names no contract entry covers, plus contract entries naming nothing declared. */
export function contractMismatches(declared: string[], classified: string[]): string[] {
  const have = new Set(classified);
  const known = new Set(declared);
  return [
    ...declared.filter((name) => !have.has(name)).map((name) => `${name}: no action`),
    ...classified.filter((name) => !known.has(name)).map((name) => `${name}: no longer declared`),
  ];
}

function collectionRow(name: string, category: string, unclassified: string[]): CollectionRow {
  if (category === "reference") {
    const kept = REFERENCE_REBUILD_KEPT_COLLECTIONS[name];
    return kept
      ? { name, category, action: "kept", reason: kept }
      : { name, category, action: "emptied and reseeded", reason: "Replaced, never merged." };
  }
  if (category === "runtime") {
    const exempt = RESIDUE_SCAN_RUNTIME_EXEMPT[name];
    return exempt
      ? { name, category, action: "rebuilt in place", reason: exempt }
      : { name, category, action: "wiped", reason: "World state of the outgoing world." };
  }
  if (category === "preserved") {
    const rule = PRESERVED_COLLECTION_CONTRACT[name];
    if (!rule) {
      unclassified.push(`collection ${name}: preserved with no reset contract`);
      return { name, category, action: "UNCLASSIFIED", reason: "" };
    }
    if (rule.kind === "fields") {
      return { name, category, action: "kept, field by field", reason: rule.typeName };
    }
    return {
      name,
      category,
      action: rule.kind === "emptied" ? "emptied" : "kept whole",
      reason: rule.reason,
    };
  }
  return { name, category, action: "outside the reset", reason: `${category} collection` };
}

function fieldRows(unclassified: string[]): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const [collection, rule] of Object.entries(PRESERVED_COLLECTION_CONTRACT)) {
    if (rule.kind !== "fields") continue;
    for (const [field, fieldRule] of Object.entries(rule.fields)) {
      rows.push({ collection, field, action: fieldRule.action, reason: fieldRule.reason });
    }
    for (const problem of contractMismatches(
      declaredFields(rule.typeFile, rule.typeName),
      Object.keys(rule.fields)
    )) {
      unclassified.push(`field ${collection}.${problem}`);
    }
  }
  return rows;
}

function datasetRows(unclassified: string[]): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const dataset of PRESET_DATASETS) {
    const status: DatasetRow["status"] = {};
    for (const preset of SEED_PRESET_IDS) {
      if (dataset.regionalCountry && !simulatesRegions(preset, dataset.regionalCountry)) {
        status[preset] = "not simulated";
      } else if (dataset.requiredIn.includes(preset)) {
        status[preset] = dataset.provide(preset) == null ? "missing" : "provided";
      } else {
        status[preset] = "optional";
      }
    }
    if (dataset.requiredIn.length === 0 && !dataset.optionalReason) {
      unclassified.push(`dataset ${dataset.id}: required in no preset and no reason given`);
    }
    rows.push({
      id: dataset.id,
      kind: "per-preset",
      reason: dataset.optionalReason ?? "Required where listed.",
      status,
    });
  }
  for (const dataset of ERA_INVARIANT_DATASETS) {
    rows.push({ id: dataset.id, kind: "era-invariant", reason: dataset.reason, status: {} });
  }
  for (const file of SEED_DATA_FILES) {
    rows.push({
      id: file.id,
      kind: "data-file",
      reason: "Validated against its schema.",
      status: {},
    });
  }
  return rows;
}

export function buildMasterReport(): MasterReport {
  const unclassified: string[] = [];
  const collections = SEED_MANIFEST.map((entry) =>
    collectionRow(entry.name, entry.category, unclassified)
  );
  const fields = fieldRows(unclassified);
  for (const row of [...collections, ...fields]) {
    if (row.reason) continue;
    const label = "name" in row ? row.name : `${row.collection}.${row.field}`;
    unclassified.push(`entry ${label}: no reason given`);
  }
  const datasets = datasetRows(unclassified);
  const contractGaps = Object.fromEntries(
    SEED_PRESET_IDS.map((preset) => [preset, checkSeedContract(preset).length])
  );
  const gameStateKept = Object.entries(GAME_STATE_RESET_PRESERVED_FIELD_REASONS)
    .map(([field, reason]) => ({ field, reason }))
    .sort((a, b) => a.field.localeCompare(b.field));
  return { collections, fields, gameStateKept, datasets, contractGaps, unclassified };
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

export function renderMasterReport(report: MasterReport): string {
  const out: string[] = ["# Seed and reset master report", ""];
  out.push(`Unclassified entries: ${report.unclassified.length}`, "");
  for (const line of report.unclassified) out.push(`- ${line}`);
  out.push("", "## Contract gaps per preset", "", "| Preset | Gaps |", "| --- | --- |");
  for (const [preset, count] of Object.entries(report.contractGaps)) {
    out.push(`| ${preset} | ${count} |`);
  }
  out.push(
    "",
    "## Collections",
    "",
    "| Collection | Category | Reset action | Reason |",
    "| --- | --- | --- | --- |"
  );
  for (const row of report.collections) {
    out.push(`| ${row.name} | ${row.category} | ${row.action} | ${cell(row.reason)} |`);
  }
  out.push(
    "",
    "## Preserved fields",
    "",
    "| Collection | Field | Action | Reason |",
    "| --- | --- | --- | --- |"
  );
  for (const row of report.fields) {
    out.push(`| ${row.collection} | ${row.field} | ${row.action} | ${cell(row.reason)} |`);
  }
  out.push(
    "",
    "## gameState fields kept across a reset",
    "",
    "| Field | Reason |",
    "| --- | --- |"
  );
  for (const row of report.gameStateKept) out.push(`| ${row.field} | ${cell(row.reason)} |`);
  out.push("", "Every other gameState field is removed unless the reset writes it.", "");
  out.push("## Datasets", "", `| Dataset | Kind | ${SEED_PRESET_IDS.join(" | ")} | Note |`);
  out.push(`| --- | --- | ${SEED_PRESET_IDS.map(() => "---").join(" | ")} | --- |`);
  for (const row of report.datasets) {
    const statuses = SEED_PRESET_IDS.map((preset) => row.status[preset] ?? "n/a");
    out.push(`| ${row.id} | ${row.kind} | ${statuses.join(" | ")} | ${cell(row.reason)} |`);
  }
  return `${out.join("\n")}\n`;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/seedMasterReport.ts")) {
  const report = buildMasterReport();
  const markdown = renderMasterReport(report);
  const target = process.argv[2];
  if (target) writeFileSync(target, markdown);
  else process.stdout.write(markdown);
  if (report.unclassified.length > 0) {
    process.stderr.write(`${report.unclassified.length} unclassified entries\n`);
    process.exit(1);
  }
}
