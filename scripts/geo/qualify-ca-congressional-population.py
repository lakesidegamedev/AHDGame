"""Audit official AB 604 county/district weights; write public-data reports externally.

Inputs: downloaded ca-ab604-blocks.csv, ca-ab604-redistricting.zip,
ca-official-population/cd01.html ... cd52.html and ca-presidential-parts.csv.
No database or third-party Python dependencies. Does not install seed data.
"""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import re
import struct
import zipfile
from html.parser import HTMLParser


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.table, self.row, self.cell = {}, None, [], None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.table = dict(attrs).get("id")
            if self.table:
                self.tables[self.table] = []
        elif self.table and tag == "tr":
            self.row = []
        elif self.table and tag in ("th", "td"):
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("th", "td") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.table and self.row:
            self.tables[self.table].append(self.row)
        elif tag == "table":
            self.table = None


def apportion(weights, total):
    """Integer-only source apportionment, with county/district key tie breaks."""
    denominator = sum(weights.values())
    if total and not denominator:
        raise ValueError("Cannot allocate a populated county without weights")
    result = {key: (value * total // denominator if denominator else 0)
              for key, value in weights.items()}
    order = sorted(weights, key=lambda key: (
        -(weights[key] * total % denominator if denominator else 0), key))
    for key in order[:total - sum(result.values())]:
        result[key] += 1
    return result


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--inputs", required=True)
    args.add_argument("--out", required=True)
    options = args.parse_args()
    root, repo = pathlib.Path(options.inputs), pathlib.Path.cwd()
    manifest = []

    def read(name, url):
        raw = (root / name).read_bytes()
        manifest.append({"file": name, "url": url, "sha256": hashlib.sha256(raw).hexdigest()})
        return raw

    reference = json.loads((repo / "src/data/counties/CA.json").read_text(encoding="utf-8"))["counties"]
    county_by_name = {row["name"]: row["fips"] for row in reference}
    reference_hash = hashlib.sha256((repo / "src/data/counties/CA.json").read_bytes()).hexdigest()
    blocks = read("ca-ab604-blocks.csv", "https://sapro.senate.ca.gov/media/491")
    block_ids, block_pairs, block_map = set(), collections.Counter(), {}
    for block, district in csv.reader(blocks.decode("utf-8-sig").splitlines()):
        if len(block) != 15 or not block.startswith("06") or not block.isdigit() or block in block_ids:
            raise ValueError("Invalid or duplicate official block")
        block_ids.add(block)
        block_pairs[(block[:5], f"CA-{int(district):02}")] += 1
        block_map[block] = f"CA-{int(district):02}"
    archive = read("ca-ab604-redistricting.zip", "https://sapro.senate.ca.gov/media/504")
    import io
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        if source.read("AB604.csv") != blocks:
            raise ValueError("Direct block assignment and official ZIP disagree")
        dbf = source.read("AB604.dbf")
    records, header, width = struct.unpack_from("<IHH", dbf, 4)
    fields = []
    for offset in range(32, header - 1, 32):
        name = dbf[offset:offset + 11].split(b"\0")[0].decode()
        fields.append((name, dbf[offset + 16]))
    district_totals = {}
    for record in range(records):
        start = header + record * width
        if dbf[start:start + 1] == b"*":
            raise ValueError("Unexpected deleted district record")
        position, values = start + 1, {}
        for name, length in fields:
            values[name] = dbf[position:position + length].decode("ascii").strip()
            position += length
        district_totals[f"CA-{int(values['DISTRICT']):02}"] = int(float(values["A_POP"]))
    parts, county_totals, published_discrepancies = [], collections.Counter(), []
    for number in range(1, 53):
        district_id = f"CA-{number:02}"
        suffix = f"congressional-district-{number:02}-2025" + ("-0" if number == 43 else "")
        url = "https://sdmg.senate.ca.gov/committeehome/2025-congressional-districts/" + suffix
        parser = Tables()
        parser.feed(read(f"ca-official-population/cd{number:02}.html", url).decode("utf-8", errors="replace"))
        total_rows = [row for rows in parser.tables.values() for row in rows
                      if row[0] == "Total Population (POP)"]
        if len(total_rows) != 1:
            raise ValueError("Missing/ambiguous district population table")
        total = int(total_rows[0][1].replace(",", ""))
        rows = parser.tables.get("COUNTIESINDISTRICT", [])[1:]
        if not rows:
            raise ValueError(f"Missing county rows: {district_id}")
        difference = sum(int(row[1].replace(",", "")) for row in rows) - total
        if difference:
            published_discrepancies.append({"districtId": district_id, "difference": difference})
        if total != district_totals.get(district_id):
            raise ValueError(f"Official population table and AB604 DBF differ: {district_id}")
        for name, count, _percent in rows:
            if name not in county_by_name:
                raise ValueError(f"County not in game roster: {name}")
            population = int(count.replace(",", ""))
            county_id = county_by_name[name]
            parts.append({"id": f"{county_id}:{district_id}", "countyId": county_id,
                          "countyName": name, "districtId": district_id, "referencePopulation": population})
            county_totals[county_id] += population
    pairs = {(row["countyId"], row["districtId"]) for row in parts}
    if len(parts) != len(pairs) or pairs != set(block_pairs) or set(county_totals) != set(county_by_name.values()):
        raise ValueError("Population, block and game county/district rosters differ")
    vote_pairs, district = set(), None
    for row in csv.reader((root / "ca-presidential-parts.csv").read_text(encoding="utf-8").splitlines()):
        if row[0].isdigit():
            district = f"CA-{int(row[0]):02}"
        if district and row[1] and row[2].replace(",", "").isdigit():
            name = row[1].removesuffix(" (pt.)")
            vote_pairs.add((county_by_name[name], district))
    if pairs != vote_pairs:
        raise ValueError("Presidential and official population overlap rosters differ")
    # Use exact unadjusted Census block residents for the actual weights.
    # The web tables above are only independent roster/plan checks: their
    # adjusted county rows do not always sum to their own district total.
    census = read("ca2020.pl.zip", "https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/California/ca2020.pl.zip")
    block_population, raw_parts = {}, collections.Counter()
    state_population = None
    with zipfile.ZipFile(io.BytesIO(census)) as source:
        with source.open("cageo2020.pl") as geography:
            for line in geography:
                row = line.decode("latin-1").rstrip("\r\n").split("|")
                if row[:2] != ["PLST", "CA"]:
                    raise ValueError("Unexpected Census geographic schema")
                if row[2] == "040":
                    state_population = int(row[-7])  # POP100, followed by HU100, latitude, longitude and metadata.
                if row[2] != "750":
                    continue
                block, residents = row[9], int(row[-7])
                if row[8] != "7500000US" + block or len(block) != 15 or block in block_population or residents < 0:
                    raise ValueError("Invalid Census block resident record")
                block_population[block] = residents
                if block not in block_map:
                    raise ValueError("Census block absent from official AB604 assignments")
                raw_parts[(block[:5], block_map[block])] += residents
    if set(block_population) != block_ids or sum(block_population.values()) != state_population:
        raise ValueError("Official plan and Census block universe/state checksum differ")
    if state_population != 39538223:
        raise ValueError("California Census 2020 resident checksum differs")
    parts = [{**row, "adjustedPublishedPopulation": row["referencePopulation"],
              "referencePopulation": raw_parts[(row["countyId"], row["districtId"])]} for row in parts]
    county_totals = collections.Counter()
    for row in parts:
        county_totals[row["countyId"]] += row["referencePopulation"]
    raw_district_totals = collections.Counter()
    for row in parts:
        raw_district_totals[row["districtId"]] += row["referencePopulation"]
    history_file = repo / "src/lib/countries/us/data/countyPopulationHistory.json"
    history = json.loads(history_file.read_text(encoding="utf-8"))
    populations = history["snapshots"]["2025"]["populations"]
    if not all(key in populations for key in county_totals):
        raise ValueError("Incomplete 2027 county population baseline")
    def projected(total):
        county_stocks = apportion({key: populations[key] for key in county_totals}, total)
        output = []
        for county, stock in county_stocks.items():
            selected = [row for row in parts if row["countyId"] == county]
            allocated = apportion({row["id"]: row["referencePopulation"] for row in selected}, stock)
            if sum(allocated.values()) != stock:
                raise ValueError("County population not conserved")
            output.extend({**row, "population": allocated[row["id"]]} for row in selected)
        if sum(row["population"] for row in output) != total:
            raise ValueError("State population not conserved")
        return output
    population = sum(populations[key] for key in county_totals)
    seed_file = repo / "src/lib/countries/us/data/usStates2027.ts"
    seed_match = re.search(r'_id:\s*"CA"[^}]*?population:\s*(\d+)', seed_file.read_text(encoding="utf-8"))
    if not seed_match or int(seed_match[1]) != population:
        raise ValueError("County 2025 stocks do not match the actual 2027 state seed")
    plan = projected(population)
    for test_total in (0, 1, 100000000, population):
        projected(test_total)
    sums = collections.Counter()
    for row in plan:
        sums[row["districtId"]] += row["population"]
    median = sorted(sums.values())[len(sums) // 2]
    quotes = []
    for name, county in county_by_name.items():
        selected = [row for row in plan if row["countyId"] == county]
        factor = .6 if len(selected) > 1 else 1
        residents = sum(row["population"] for row in selected)
        import math
        price = math.ceil(2 * max(.25, residents / median * factor) * 2 - 1e-9) / 2
        quotes.append({"countyId": county, "countyName": name, "population": residents,
                       "districts": len(selected), "initialQuotePs": price})
    report = {"planId": "US-CA-AB604-2025", "status": "reference-qualified-local-stocks-unobserved",
              "semantics": "Exact unadjusted Census 2020 block residents joined to official AB604 block assignments. Shares are scaled to the game's 2025 county reference stocks, not installed in Mongo.",
              "manifest": manifest, "referenceCountySha256": reference_hash,
              "historySha256": hashlib.sha256(history_file.read_bytes()).hexdigest(),
              "seed2027Sha256": hashlib.sha256(seed_file.read_bytes()).hexdigest(),
              "seed2027Population": int(seed_match[1]),
              "implementationSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
              "blocks": len(block_ids), "counties": len(county_totals), "districts": len(sums),
              "spots": len(parts), "officialAdjustedPopulation": sum(district_totals.values()),
              "rawCensusPopulation": state_population, "publishedCountyDiscrepancies": published_discrepancies,
              "rawDistrictPopulationRange": [min(raw_district_totals.values()), max(raw_district_totals.values())],
              "reference2025Population": population, "projectedDistrictPopulationRange": [min(sums.values()), max(sums.values())],
              "medianProjectedDistrictPopulation": median, "parts": plan, "quotes": quotes,
              "checks": {"dbfMatchesHtml": True, "blockRostersMatchPopulation": True,
                         "voteOverlapRostersMatch": True, "countyAndStateConservation": True,
                         "countyStocksMatch2027Seed": True},
              "limitations": ["Matching vote overlap rosters does not prove vote precinct geometries match block for block.",
                              "Published adjusted county tables have reconciliation discrepancies and are not used as resident weights.",
                              "Only California is qualified; local persisted county stocks are checked separately."]}
    pathlib.Path(options.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "blocks", "counties", "districts", "spots", "officialAdjustedPopulation", "reference2025Population", "projectedDistrictPopulationRange")}))


if __name__ == "__main__":
    main()
