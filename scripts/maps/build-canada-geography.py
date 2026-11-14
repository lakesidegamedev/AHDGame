"""Build Canadian map/reference assets from official, externally cached sources.

Usage: python scripts/maps/build-canada-geography.py --source-dir <external cache>
Candidate identities never enter the generated assets. Requires only Python's stdlib.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile

PROVINCES = {"10": "NL", "11": "PE", "12": "NS", "13": "NB", "24": "QC",
             "35": "ON", "46": "MB", "47": "SK", "48": "AB", "59": "BC",
             "60": "YT", "61": "NT", "62": "NU"}
PARTIES = {"LIB": "Liberal/Libéral", "CON": "Conservative/Conservateur",
           "NDP": "Party/NPD-Nouveau Parti démocratique", "BQ": "Bloc Québécois/Bloc Québécois",
           "GRN": "Green Party/Parti Vert"}
SOURCES = {
    "cd-planar.json": "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/4/query?where=1%3D1&outFields=CDUID%2CDGUID%2CCDNAME%2CCDTYPE%2CPRUID&outSR=3347&f=geojson&maxAllowableOffset=500&geometryPrecision=1&returnGeometry=true",
    "population-zip.zip": "https://www150.statcan.gc.ca/n1/tbl/csv/98100002-eng.zip",
    "fed-boundaries.zip": "https://www.elections.ca/res/cir/mapsCorner/vector/FederalElectoralDistricts_2025_SHP.zip",
    "votes-table11.csv": "https://www.elections.ca/res/rep/off/ovrGE45/62/data_donnees/table_tableau11.csv",
    "votes-table12.csv": "https://www.elections.ca/res/rep/off/ovrGE45/62/data_donnees/table_tableau12.csv",
}


def label(value):
    return value.replace("—", "-").replace("–", "-")


def dbf_rows(data):
    count, start, size = struct.unpack_from("<IHH", data, 4)
    fields, offset = [], 32
    while data[offset] != 13:
        fields.append((data[offset:offset + 11].split(b"\0")[0].decode(), data[offset + 16]))
        offset += 32
    for i in range(count):
        row, offset = {}, start + i * size + 1
        if data[offset - 1] == 42:
            raise ValueError("Deleted riding record")
        for key, length in fields:
            row[key] = data[offset:offset + length].decode("utf-8").strip()
            offset += length
        yield row


def shp_polygons(data):
    offset = 100
    while offset < len(data):
        _, words = struct.unpack_from(">II", data, offset)
        start = offset + 8
        shape = struct.unpack_from("<I", data, start)[0]
        if shape not in (5, 15):
            raise ValueError(f"Expected polygon, found shape {shape}")
        parts, points = struct.unpack_from("<II", data, start + 36)
        indices = list(struct.unpack_from(f"<{parts}I", data, start + 44)) + [points]
        coords = [struct.unpack_from("<dd", data, start + 44 + parts * 4 + i * 16)
                  for i in range(points)]
        yield [coords[indices[i]:indices[i + 1]] for i in range(parts)]
        offset = start + words * 2


def simplify(points, tolerance=500):
    """Deterministic Douglas-Peucker, retaining small closed rings intact."""
    if len(points) <= 4:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    denominator = dx * dx + dy * dy
    maximum, index = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) if denominator else 0
        distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2
        if distance > maximum:
            maximum, index = distance, i
    if maximum <= tolerance * tolerance:
        return [a, b]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def write_region(destination, units, notice):
    points = [p for unit in units for ring in unit["rings"] for p in ring]
    x0, x1 = min(p[0] for p in points), max(p[0] for p in points)
    y0, y1 = min(p[1] for p in points), max(p[1] for p in points)
    scale = 980 / max(x1 - x0, y1 - y0)
    output = []
    for unit in sorted(units, key=lambda u: u["id"]):
        rings = unit.pop("rings")
        commands = []
        for ring in rings:
            simple = simplify(ring)
            if len(simple) < 4:
                simple = ring
            commands.append("M" + "L".join(f"{10 + (x-x0)*scale:.2f},{10 + (y1-y)*scale:.2f}" for x, y in simple) + "Z")
        output.append({**unit, "path": "".join(commands)})
    result = {"viewBox": f"0 0 {(x1-x0)*scale+20:.2f} {(y1-y0)*scale+20:.2f}",
              "countryId": "CA", "supportedPresets": ["2027-default"], "notice": notice,
              "subdivisions": output}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


def build(source, output):
    census_zip = zipfile.ZipFile(source / "population-zip.zip")
    census_file = next(n for n in census_zip.namelist() if n.endswith(".csv") and "MetaData" not in n)
    census = list(csv.DictReader(io.TextIOWrapper(census_zip.open(census_file), encoding="utf-8-sig")))
    population_key = next(k for k in census[0] if k.startswith("Population and dwelling counts (13): Population, 2021"))
    populations = {r["DGUID"]: int(r[population_key]) for r in census if r["DGUID"].startswith("2021A0003")}
    cds = json.loads((source / "cd-planar.json").read_text(encoding="utf-8"))["features"]
    if len(populations) != 293 or len(cds) != 293:
        raise ValueError("Incomplete 2021 census-division roster")
    groups = {p: [] for p in PROVINCES}
    for feature in cds:
        p = feature["properties"]
        coords = feature["geometry"]["coordinates"]
        rings = coords if feature["geometry"]["type"] == "Polygon" else [r for polygon in coords for r in polygon]
        population = populations[p["DGUID"]]
        groups[p["PRUID"]].append({"id": f"CA-CD-2021-{p['CDUID']}", "name": label(p["CDNAME"]),
            "divisionType": p["CDTYPE"], "population": population, "electorate": population, "rings": rings})
    summaries = list(csv.DictReader(io.StringIO((source / "votes-table11.csv").read_text(encoding="utf-8-sig"))))
    code_key = next(k for k in summaries[0] if k.startswith("Electoral District Number/"))
    summaries = {r[code_key]: r for r in summaries}
    votes = {code: {} for code in summaries}
    for row in csv.DictReader(io.StringIO((source / "votes-table12.csv").read_text(encoding="utf-8-sig"))):
        code = row[code_key]
        party = next((k for k, suffix in PARTIES.items() if row["Candidate/Candidat"].endswith(suffix)), "OTH")
        votes[code][party] = votes[code].get(party, 0) + int(row["Votes Obtained/Votes obtenus"])
    archive = zipfile.ZipFile(source / "fed-boundaries.zip")
    records = list(dbf_rows(archive.read("SHP/FED_CA_2025_EN.dbf")))
    polygons = list(shp_polygons(archive.read("SHP/FED_CA_2025_EN.shp")))
    if len(records) != len(polygons):
        raise ValueError("Shapefile record mismatch")
    ridings = {}
    for record, rings in zip(records, polygons):
        code = str(int(record["FED_NUM"]))
        if record["REPORDER"] != "2023" or code not in summaries:
            raise ValueError("Unqualified riding boundary vintage")
        summary = summaries[code]
        total = sum(votes[code].values())
        if total != int(summary["Valid Ballots/Bulletins valides"]):
            raise ValueError(f"Riding vote totals disagree: {code}")
        unit = ridings.setdefault(code, {"id": f"CA-FED-2023-{code}", "name": label(record["ED_NAMEE"]),
            "electorate": int(summary["Electors/Électeurs"]), "population": int(summary["Population"]),
            "partyShares": {p: v / total for p, v in sorted(votes[code].items())}, "rings": []})
        unit["rings"].extend(rings)
    if len(ridings) != 343 or sum(populations.values()) != sum(int(r["Population"]) for r in summaries.values()):
        raise ValueError("Incomplete riding roster or census population mismatch")
    for code, province in PROVINCES.items():
        state = f"CA_{province}"
        write_region(output / "census-divisions" / f"{state}.json", groups[code],
            "Modeled census-division distribution using 2021 population weights scaled to the game's provincial population. No observed local voting baseline is available. Digital boundaries include assigned water areas.")
        write_region(output / "federal-ridings" / f"{state}.json", [r for c, r in ridings.items() if c.startswith(code)],
            "Projected riding placement uses the 2023 boundaries and 2025 federal vote shares. Provincial seat totals follow the game's aggregate allocation. Unmatched parties use province-wide shares. Digital boundaries include assigned water areas.")
    manifest = {"countryId": "CA", "censusYear": 2021, "boundaryOrder": 2023, "electionYear": 2025,
        "projection": "NAD83 / Statistics Canada Lambert (EPSG:3347)", "simplificationMetres": 500,
        "censusDivisions": 293, "federalRidings": 343, "censusPopulation": sum(populations.values()),
        "populationBaseline": "ca-census-2021-proportional", "supportedPresets": ["2027-default"],
        "sources": [{"file": name, "url": url, "sha256": hashlib.sha256((source / name).read_bytes()).hexdigest()} for name, url in SOURCES.items()],
        "licence": ["Statistics Canada Open Licence", "Open Government Licence - Canada"],
        "coverage": {f"CA_{p}": {"censusDivisions": len(groups[c]), "federalRidings": sum(k.startswith(c) for k in ridings)} for c, p in PROVINCES.items()}}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("Qualified 293 census divisions, 343 ridings and 36,991,981 reference residents")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("src/data/subdivisions/ca"))
    args = parser.parse_args()
    build(args.source_dir, args.output_dir)
