import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SINGLEPLAYER_CAPABILITIES_FILE,
  buildSingleplayerCapabilities,
} from "@/lib/singleplayer/capabilities";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: tsx scripts/singleplayer/write-capabilities.ts <output dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, SINGLEPLAYER_CAPABILITIES_FILE);
writeFileSync(file, `${JSON.stringify(buildSingleplayerCapabilities(), null, 2)}\n`);
console.log(`wrote ${file}`);
