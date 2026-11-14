# Canadian local geography

Canada uses two separate, overlapping layers:

| Layer | Vintage | Units | Use |
| --- | --- | --- | --- |
| Census divisions | Statistics Canada 2021 | 293 | Local population stocks and modeled local maps |
| Federal ridings | 2023 Representation Order, 2025 election boundaries | 343 | Commons riding maps and Campaign Here |

Census divisions are the consistent statistical layer across all provinces and
territories. They are not all local governments or counties. The source's
`CDTYPE` designation is retained as `divisionType`, including regional districts,
regional county municipalities and equivalent territories.

The census-division and riding reference populations both sum to **36,991,981**
people in the 2021 census. Persisted census-division populations are apportioned
to each game's province/territory total with exact integer conservation. The
`ca-census-2021-proportional` label identifies these as dated reference weights,
not observed 2027 local headcounts. Demographic changes update the same stocks.

Federal riding `electorate` values are the registered electors in Elections
Canada's 2025 results table 11. Party shares come from table 12, with smaller
unmapped parties aggregated as `OTH`. Candidate names, residences and
occupations are never written to these assets. Every riding's candidate-vote
sum is checked against its valid-ballot total. Multiple source polygons with the
same riding number are combined, preserving all 343 riding identities.

Local maps are qualified for **2027-default**. Other presets fail closed instead
of displaying modern riding boundaries as historical ones. Census-division maps
have no observed local voting baseline; their proportional projections are
explicitly labeled. Riding placement is also a projection from dated 2025
baselines, constrained to the game's provincial seat allocation. Unmatched party abbreviations
use province-wide shares. Federal ridings are never used as provincial electoral
districts.

Campaign Here uses the existing US political-strength cost and pressure ladder,
self/ally efficiency, 7.5-point cap and 0.5-point per-turn decay. It changes riding
placement within the actual provincial allocation. It does not change provincial
votes or award extra seats. The campaign request binds the election, province,
riding id and boundary order. Strength and boost writes commit in one transaction.
Completed Commons elections retain their own riding geometry, placement, party
colors and labels in the finalized tally. Older elections without a receipt are
labeled unsupported; live holders or party documents do not substitute for it.

New resets seed all 293 stocks automatically. Existing worlds use migration
`2026-11-14-canadian-census-divisions`, also registered for singleplayer startup.
Pause turns and finish pending demographic receipts before applying it. It is
idempotent and does not alter provincial totals or US stocks. The existing
country/state index and collection reset policy cover this layer. Secession
retires the departed parent's subdivision stocks inside the existing transaction.

## Rebuilding

Cache the five official sources using the filenames and exact URLs in
[manifest.json](./manifest.json), then run:

```sh
python scripts/maps/build-canada-geography.py --source-dir <external-source-cache>
```

The builder requires only Python's standard library. Both boundary sources use
NAD83 / Statistics Canada Lambert (EPSG:3347). SVG paths are generalized at 500
metres for display; no population or vote crosswalk is inferred from polygon area.
The manifest records source SHA-256 checksums, coverage, projection and vintages.

Sources: [Statistics Canada population table 98-10-0002-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000201),
[2021 census boundaries](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm),
[Elections Canada 2025 boundary dataset](https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05)
and [official 45th election results](https://www.elections.ca/content.aspx?section=res&dir=rep/off/45gedata&document=summary&lang=e).
Statistics Canada data is reproduced under its Open Licence; electoral boundary
data is provided under the Open Government Licence - Canada. Adaptations and game
projections are not endorsed by either source agency.
