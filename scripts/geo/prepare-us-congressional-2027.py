"""Download and decode pinned Census CD120 polygons without third-party dependencies.

Only source caches/intermediates go to --cache, outside the repository.
The companion build-us-congressional-2027.mjs creates the committed render assets.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import urllib.request
import zipfile

STATES = dict(zip(
    "01 02 04 05 06 08 09 10 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56".split(),
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()))


def dbf_rows(data):
    count, header, width = struct.unpack_from("<IHH", data, 4)
    fields = []
    for offset in range(32, header - 1, 32):
        if data[offset] == 13:
            break
        name = data[offset:offset + 11].split(b"\0")[0].decode("ascii")
        fields.append((name, data[offset + 16]))
    for row in range(count):
        start = header + row * width
        if data[start:start + 1] != b" ":
            raise ValueError("Deleted/malformed Census DBF row")
        pos, values = start + 1, {}
        for name, length in fields:
            values[name] = data[pos:pos + length].decode("ascii").strip()
            pos += length
        yield values


def simplify(ring, tolerance=0.00025):
    # Rendering only. Retain complete unsimplified source archives and hashes.
    keep, stack = {0, len(ring) - 1}, [(0, len(ring) - 1)]
    while stack:
        lo, hi = stack.pop()
        ax, ay = ring[lo]
        bx, by = ring[hi]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        best, index = tolerance * tolerance, None
        for i in range(lo + 1, hi):
            px, py = ring[i]
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / norm)) if norm else 0
            distance = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if distance > best:
                best, index = distance, i
        if index is not None:
            keep.add(index)
            stack.extend([(lo, index), (index, hi)])
    result = [ring[i] for i in sorted(keep)]
    return result if len(result) >= 4 else ring


def area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])) / 2


def contains(ring, point):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def shapes(data):
    offset = 100
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset + 4)[0] * 2
        shape = data[offset + 8:offset + 8 + length]
        offset += 8 + length
        kind = struct.unpack_from("<I", shape)[0]
        if kind not in (5, 15):
            raise ValueError(f"Expected Census polygon, got {kind}")
        parts, points = struct.unpack_from("<II", shape, 36)
        starts = list(struct.unpack_from(f"<{parts}I", shape, 44)) + [points]
        coords = list(struct.iter_unpack("<dd", shape[44 + 4 * parts:44 + 4 * parts + 16 * points]))
        rings = [coords[starts[i]:starts[i + 1]] for i in range(parts)]
        polygons = [[ring] for ring in rings if area(ring) < 0]
        if not polygons:
            raise ValueError("Polygon lacks a clockwise exterior")
        for hole in (ring for ring in rings if area(ring) >= 0):
            # Census holes can touch their exterior at the first vertex.
            owners = [poly for poly in polygons if any(contains(poly[0], point) for point in hole)]
            if not owners:
                raise ValueError("Polygon hole has no exterior")
            min(owners, key=lambda p: abs(area(p[0]))).append(hole)
        yield {"type": "MultiPolygon", "coordinates": [[simplify(r) for r in poly] for poly in polygons]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    args = parser.parse_args()
    root = pathlib.Path(args.cache).resolve()
    if root == pathlib.Path.cwd() or pathlib.Path.cwd() in root.parents:
        raise ValueError("Source cache must be outside the repository")
    root.mkdir(parents=True, exist_ok=True)
    manifest = pathlib.Path(__file__).resolve().parents[2] / "src/data/congressional-districts/2027/manifest.json"
    pinned = {s["state"]: s["sha256"] for s in json.loads(manifest.read_text())["sources"]} if manifest.exists() else {}
    sources = []
    for fips, state in STATES.items():
        name = f"tl_2026_{fips}_cd120.zip"
        url = f"https://www2.census.gov/geo/tiger/TIGER2026/CD/{name}"
        archive = root / name
        if not archive.exists():
            with urllib.request.urlopen(url, timeout=90) as response:
                archive.write_bytes(response.read())
        raw = archive.read_bytes()
        if state in pinned and hashlib.sha256(raw).hexdigest() != pinned[state]:
            raise ValueError(f"Census source differs from the reviewed manifest: {state}")
        with zipfile.ZipFile(archive) as zipped:
            attributes = list(dbf_rows(zipped.read(next(n for n in zipped.namelist() if n.endswith(".dbf")))))
            polygons = list(shapes(zipped.read(next(n for n in zipped.namelist() if n.endswith(".shp")))))
        if len(attributes) != len(polygons):
            raise ValueError(f"SHP/DBF record count mismatch: {state}")
        features = []
        for row, geometry in zip(attributes, polygons):
            number = row["CD120FP"]
            if number in ("98", "99", "ZZ"):
                continue  # Non-voting/unassigned statistical entities.
            cd = f"{state}-AL" if number == "00" else f"{state}-{int(number):02}"
            features.append({"type": "Feature", "properties": {"cd": cd, "geoid": row["GEOID"]}, "geometry": geometry})
        features.sort(key=lambda f: f["properties"]["cd"])
        (root / f"{state}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf8")
        sources.append({"state": state, "fips": fips, "url": url, "sha256": hashlib.sha256(raw).hexdigest(), "districts": len(features)})
        print(f"{state}: {len(features)} districts", flush=True)
    (root / "sources.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
