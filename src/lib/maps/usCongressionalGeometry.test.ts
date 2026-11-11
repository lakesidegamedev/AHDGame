import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { usCongressionalGeometryDirectory } from "./usCongressionalGeometry";
import { loadCookPvi } from "@/lib/redistricting/loadCookPvi";
import { states2027 } from "@/lib/seeds/reference/states2027";

describe("2027 US congressional geometry", () => {
  it("keeps historical presets on their existing geometry", () => {
    expect(usCongressionalGeometryDirectory("1991-default")).toBe("congressional-districts");
    expect(usCongressionalGeometryDirectory("2027-default")).toBe("congressional-districts/2027");
  });
  it("covers all 435 numbered offices with pinned, nonempty Census paths", () => {
    const root = path.join(
      process.cwd(),
      "src/data",
      usCongressionalGeometryDirectory("2027-default")
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    let total = 0;
    for (const state of states2027.filter((s) => s.houseDistricts > 0)) {
      const raw = fs.readFileSync(path.join(root, `${state._id}.json`), "utf8");
      const data = JSON.parse(raw);
      expect(data.districts.map((d: { cd: string }) => d.cd)).toEqual(
        Array.from(
          { length: state.houseDistricts },
          (_, i) =>
            `${state._id}-${state.houseDistricts === 1 ? "AL" : String(i + 1).padStart(2, "0")}`
        )
      );
      expect(
        data.districts.every((d: { path: string }) => d.path && !/NaN|Infinity/.test(d.path))
      ).toBe(true);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(
        manifest.outputs.find((s: { state: string }) => s.state === state._id).sha256
      );
      expect(loadCookPvi(state._id, state.houseDistricts, "2027-default")).toBeNull();
      total += data.districts.length;
    }
    expect(total).toBe(435);
  });
});
