# src/lib/seeds/

Runtime seed data and helper functions imported throughout the application.

## Boundary with `scripts/seeds/`

| Location                              | What belongs here                                                              | Consumed by                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **`src/lib/seeds/reference/`**        | Canonical static DB seed data (states, parties, legislation types, budgets, …) | `src/lib` (seeders, grants, tests), re-exported by **`scripts/seeds/*.ts`** |
| **`scripts/seeds/*.ts`** (most files) | Re-exports of `reference/` for CLI-only scripts                                | `scripts/seed*.ts`, `scripts/simulate-*.ts`, etc.                           |
| **`src/lib/seeds/`** (rest of tree)   | Runtime helpers and cross-country seed logic not in `reference/`               | App routes, turn processing, components                                     |

Files here may export:

- **Data constants** used at runtime (e.g., `DEMOGRAPHIC_TURNOUT_RATES` in election logic)
- **Helper functions** called at runtime (e.g., `computeLiveGroupTurnouts()`)

## Convention for new countries

Country data lives in the country's own folder, `src/lib/countries/<cc>/data/`, not here.
The per-country folders still under `src/lib/seeds/` hold forwarders and files not yet moved; do
not add new files to them.

## Generated tables

A generated table is a JSON file under `src/data/` with a Zod schema beside the module that
reads it, and the seed contract (`contract/dataFiles.ts`) validates it. Do not emit generated
tables as TypeScript; the architecture audit rejects a new file with a generated header.
