# Contributing

A House Divided is a live game with real players, so contributions are held to a production bar. Here's what that means in practice.

## What lands easily

- Bug fixes with a reproduction and a test
- UI, accessibility, and mobile polish
- Documentation fixes (site docs go to [ahd-docs](https://github.com/lakesidegamedev/ahd-docs), wiki content lives in `src/lib/seeds/wiki/` here)
- Country content: seeds, region maps, cabinet catalogs, following an existing country as the pattern
- Tests for under-tested systems
- Performance work with before/after numbers

Issues labeled `good-first-issue` are verified and scoped.

## What needs an issue first

- **Balance changes.** Economy constants, election math, demographic weights, action costs. Back them with deterministic rules and accounting tests, a turn-cost measurement when the turn path changes, and current read-only numbers from the live world. A world simulation is not required; the maintainer runs one only when a specific question needs it. New balance behavior ships behind a stage or flag that defaults off where practical, so it can be switched on and rolled back without a deploy.
- **New mechanics.** The game has a design direction; talk before you build.
- **Schema changes.** Anything in `src/lib/db/types` affects a live production database and needs a migration plan.

Exploits and vulnerabilities: never in public issues. See [SECURITY.md](./SECURITY.md).

## Local development

Requires Node 20.19+ or 22.12+ (CI runs Node 22) and a MongoDB instance.

```bash
git clone https://github.com/lakesidegamedev/AHDGame.git
cd AHDGame
npm ci
cp .env.example .env.local
```

Set the required values in `.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/a-house-divided
AUTH_SECRET=            # openssl rand -base64 32
ADMIN_REGISTRATION_KEY= # lets the first account register as admin
CRON_SECRET=            # authenticates the turn cron
```

Everything else in `.env.example` is optional for the main app. `INTERNAL_API_KEY` is needed by server-side task scripts, while OAuth, monitoring, CAPTCHA, R2, and bot integrations can stay unset for local development.

```bash
npm run bootstrap:full   # complete historical world, including officials
npm run dev              # http://localhost:3000
```

`next dev` auto-seeds an empty database and starts the in-process turn scheduler. For UI-only work, set `DISABLE_DEV_BACKGROUND=1` and use `npm run bootstrap:full` when you intentionally need a complete world. `npm run seed` only loads the US reference pack and does not create a full playable world.

The destructive `reset-and-bootstrap` commands require `--expect-db=<database>`.
The target follows the app's precedence: `MONGODB_DB`, then `MONGO_DB_NAME`, then
the database in the connection URI, then `a-house-divided`. Check the selected
database without resetting it with:

```bash
npm run reset-and-bootstrap -- --expect-db=my_local_world --check-target
```

Removing `--check-target` performs the reset. A missing or mismatched target
assertion exits before connecting or loading the reset implementation.

Register at `/register` with your `ADMIN_REGISTRATION_KEY` to unlock the admin console. To trigger a turn manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/turn
```

### Auth, briefly

Password login plus optional Discord and Google OAuth, optional Turnstile on registration. Sessions are HS256 JWTs signed with `AUTH_SECRET` in HTTP-only cookies. Login and OAuth routes sign them; `src/lib/auth.ts` verifies them. `CRON_SECRET` authenticates cron routes, `INTERNAL_API_KEY` authenticates server-side scripts, and the Discord bot accepts deployment keys or user-created keys from Settings.

### Everyday commands

```bash
npm run dev           # dev server
npm run lint          # ESLint, with custom rules in eslint-rules/
npm run typecheck     # tsc --noEmit
npm run test:run      # Vitest unit and integration suite
npm run test:e2e      # Playwright, needs the dev server running
```

CI runs on every pull request and on pushes to `development` and `main`: lint plus the architecture audit, format check, typecheck, the sharded unit suite, the Next build, and an integration job that runs federation transactions against an isolated Mongo replica set plus the full bootstrap fixture. A final `verify` job requires all of them. CodeQL, Semgrep, and dependency review run separately.

Useful entry points:

- `src/lib/turnSystem.ts` and `src/simulation/phases/` for the turn processor
- `src/lib/db/types` for the data contracts
- `scripts/seed/` for seeders, `scripts/world/` for bootstrap, `scripts/migrations/` for migrations
- `scripts/sim/` for the headless world simulator, including `localWorldsimMcp.ts`, an MCP server over stdio that lets a coding agent run full world simulations against a local sandbox Mongo. World simulations are optional and run only when a maintainer asks for one; see [`scripts/sim/README.md`](./scripts/sim/README.md).

### Public API MCP bridge

For external read-only integrations, create a **public-scope** API key in Settings and run `npm run --silent api:mcp`. Configure your MCP client to launch that command with `AHD_API_KEY` in its environment. Set `AHD_API_BASE_URL` only for a local or alternate deployment; remote URLs must use HTTPS. The bridge exposes each public v1 read endpoint and own-key capabilities as tools, forwards the key in `X-API-Key`, and respects the API's existing rate limits. It has no write tools and does not use a session cookie. Keep the key in your client secrets store, outside repository config.

The machine-readable catalog at `/api/public/v1/meta` includes MCP setup metadata and the static CDN base URL. CDN assets are public; API data still requires a scoped key. Singleplayer keeps its local `/cdn` mirror and limits downloaded assets to 20 MB each.

## The bar for a PR

1. Branch off `development` and target `development` with the PR. One topic per PR, small over large.
2. Run `npm run verify` for lint, format, typecheck, the architecture audit, and tests. Run `npm run verify:build` for the same Next build CI uses. The architecture audit also runs in CI; new findings from your change are yours to fix.
3. New or changed API routes need integration tests. Copy the pattern from any `route.test.ts`.
4. New logic gets unit tests next to it.
5. Every PR ships a changelog note with the change. Run `npm run changelog:new -- "Title of the change"`; it writes `content/changelog/unreleased/<topic>.md`, named for your branch so it cannot collide with another PR in flight. The note carries no version: a version belongs to a release, and `npm run changelog:release -- <version> --title "..."` folds every unreleased note into one `content/changelog/dev/<version>.md` and drafts the player-facing `content/changelog/public/<version>.md` when the release is actually cut. The generated frontmatter lists the accepted `badges` (`major`, `minor`, `patch`, `hotfix`) and `areas` (`backend`, `frontend`, `fullstack`, `engine`) in a comment; anything else fails the pre-commit hook and CI. Descriptive words for what the change was about go in `tags`, which is free text.
6. Match the surrounding code: strict TypeScript, Zod on request bodies, and no new dependencies without discussion. Prefer `src/lib/db/collections` getters when one exists; typed direct `db.collection<T>("name")` access is also an established pattern. Do not invent a repository layer. No em or en dashes in player-facing text.
7. System rules stay portable. Formulas, eligibility, resolution, and state transitions belong in a `rules.ts` or `rules/` module next to the system (`src/lib/pensions/rules.ts` is the model): plain data in, plain data out, rng and dates passed in, ids as strings. The turn phase or route around it does the loading, writing, and notifying. The architecture audit blocks database access, the wall clock, `Math.random()`, `process.env`, network calls, and `async` inside that zone. Existing systems aren't being retrofitted in bulk, but a formula you add or rework lands there.
8. The PR body says why, not just what.

Code layout in one minute: `src/app/api/**` are thin route handlers (auth guard, Zod, call into lib). `src/lib/**` is the domain logic, one directory per system. The hourly turn processor is `src/lib/turnSystem.ts` with phases registered in `src/simulation/phases/`. Portable rules live in `rules.ts` / `rules/` modules beside their system. Seeds are in `scripts/seeds/` (data) and `scripts/seed/` (runners). The [engineering docs](https://docs.lakesidegames.net) go deeper.

Persisted state must have a reset policy. `npm run architecture:contracts` checks collection lifecycle entries, GameState reset writes or named preservation reasons, region state and political or macro metric field coverage, and bootstrap index coverage. Optional seed writes do not prove that a field resets when a different preset omits it. New world collections need a seed index plan or a reviewed primary-key policy. The same command flags new direct Mongo operations inside turn loops; collect ids and batch reads and writes. Frozen legacy boundaries record existing debt and must not be regenerated to approve new violations. Explain any necessary lifecycle or concurrency exception in the PR.

## Select evidence by change risk

These checks select relevant evidence. The required verify, build, security and
dependency gates above still apply. World simulations are optional: no PR waits
on one unless the maintainer asks for it.

| Change                                        | Minimum relevant qualification                                                                     | Escalation                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Copy or isolated UI behavior                  | Focused behavior check and existing merge gates                                                    | Wider behavior check when gameplay semantics change                             |
| Rules or formula                              | Deterministic rules and accounting tests; live read-only numbers for balance changes               | Longer trajectory when feedback or accumulation matters                         |
| Phase I/O or performance                      | Same-state before/after replay, preserved outputs and invariants, command/byte/memory measurements | Integrated smoke when order, writes, retries or cross-phase dependencies change |
| Scheduler, seed, migration or multiple phases | Bounded integrated replay on the relevant isolated state                                           | Longer campaign when unresolved effects span turns                              |
| New economic feedback or long-horizon balance | Experiment with question, baseline, state, metrics and horizon                                     | World simulation only when the maintainer requests one                          |

Tooling for the escalation column is documented beside it: the change-aware world simulation planner in [`scripts/sim/README.md`](./scripts/sim/README.md), and money-movement qualification in [`scripts/perf/README.md`](./scripts/perf/README.md).

## Code comments

Explain why, not history. A comment states a constraint, an invariant or a non-obvious reason the code is shaped as it is.

- No dates, issue or ticket numbers, or change narration ("previously", "used to", "the owner decided") in code comments. That belongs in the commit, the PR and the changelog.
- Keep comments short. A block over 12 lines is a sign the code needs a clearer name, a smaller function or a doc page instead.
- Prefer a clear name over a comment that explains a vague one.

`npm run architecture:contracts` enforces this with a ratchet (`scripts/architecture/commentRatchet.baseline.json`): a file may not gain overlong comment blocks or narrative comment lines, and a new file may not add any. After cleaning comments, run `npm run comment:ratchet:lower` and commit the lower baseline. The baseline can only go down.

## Name the mechanic at the top of the file

Files under `src/lib` that implement a game mechanic open with a short JSDoc block, before the imports, that names the mechanic in the words a player uses and states the two or three facts a player asks about (what it is, what it depends on, what it affects), citing the exported symbol that implements it. Keep it to two to five lines of plain English in the present tense, with every fact taken from the code in that file. The search index embeds file text, so this header is what makes the file findable for a player question.

```ts
/**
 * Cloture and the filibuster (Senate). A filibustered bill only passes when
 * at least three fifths of votes cast (For + Against + Abstain) are For:
 * see didPassWithFilibusterCheck. Two-thirds bills ignore this rule.
 */
```

## UI strings and translations

The UI chrome (navigation, settings, tutorial) is localized with next-intl. Game-generated content (news, mail, notifications, legislation) stays English. The locale comes from the `ahd-locale` cookie, not the URL; players pick a language under Settings > Appearance.

- Catalogs live in `messages/<locale>/<namespace>.json`, one top-level namespace per file. English is the source of truth; missing keys in other locales fall back to English at request time.
- New chrome copy goes in the catalog, resolved with `useTranslations("<namespace>")` (client) or `getTranslations` (server). Use ICU for plurals and interpolation; never build sentences from concatenated fragments or `s` suffix ternaries.
- Data modules that feed rendered chrome (nav menu definitions, settings section configs, tutorial chapters) store message keys; the rendering component resolves them.
- Adding a locale: extend `SUPPORTED_LOCALES` in `src/i18n/locales.ts` and create `messages/<locale>/` mirroring `messages/en/`. Natural phrasing over literal translation; informal address (du-form in German); the player-copy rules above apply in every language.

## Conflicts of interest

Many contributors also play. That is welcome, but a change can move your own standing in the game, and other players need to trust that it did not land for that reason.

Disclose a conflict when your change could directly help or hurt:

- a character you play,
- a corporation you own, run, or hold shares in, or
- a party you lead, a government you head, a nation you lead or hold office in, or anything else you control in game.

"Directly" means the change targets something you hold, or does more for it than for comparable players. A rule that applies to a whole category still counts: a change to wartime seizure affects you if you lead a nation at war, and a change to mining affects you if you own a mining corporation. If you are unsure, disclose.

Economy and turn PRs also carry an `Affects:` line in the conflict section saying who the change helps or hurts. That line is required even when you have no conflict, so reviewers can check the answer.

To disclose, tick the conflict box in the PR template and say what the link is. You do not have to name your character or corporation in the public PR: tell a maintainer privately and write "disclosed privately" in the PR instead.

The required `custom-rules` check enforces two things on contributor PRs:

- The "Conflict of interest" section stays in the description with exactly one box ticked.
- A change to economy or turn-processing code (markets, banking, trade, budgets, corporations, the turn engine and the other folders listed in `scripts/ci/pr_governance.py`) needs a maintainer's approving review before it can merge. Test files do not count. An approval keeps counting after later pushes as long as those pushes do not change economy code again; a push that does needs a fresh approval.
- Trusted contributors, listed in `scripts/ci/pr_governance.py`, skip the economy approval on PRs where they declare no conflict. A trusted contributor's conflicted PR still needs a maintainer, and changes to CI or governance files always do.

A disclosure does not block a PR. It tells the reviewer to weigh the change on its merits and against other players' positions, and a conflicted PR is never merged on its author's word alone. Staff contributors follow the same rule.

An undisclosed conflict found later is grounds to revert the change and remove contribution access, and gains made through it may be reversed in game.

## Review

The maintainer reviews every PR. Balance and economy paths get extra scrutiny; a world simulation is run only when the maintainer asks for one. Feature PRs squash merge into `development`; your PR title becomes the commit message, so write it like one. The maintainer promotes `development` to `staging` to `main` with merge commits.

By contributing you agree your contribution is licensed under [PolyForm Noncommercial 1.0.0](./LICENSE.md) and that Lakeside Games may use it in the hosted game.
