import { getCountryDisplayName } from "@/lib/country/countryDisplayNames";
import type { CountryId } from "@/lib/constants/countries";
import { CDN_LOGO_URL } from "@/lib/images/staticCdnAssets";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import { rawTurnToLarpDate } from "@/lib/utils/formatters";
import type { State } from "@/lib/db/types/state";
import { effectImpact } from "@/lib/crises/severity";
import { describeCrisisEffect } from "@/lib/crises/effectDisplay";
import { crisisImageUrl } from "@/lib/crises/crisisImages";
import { crisisKind, crisisTurnProgress } from "@/lib/crises/rules/boardView";
import { crisisScoreFor, severityBandFromScore } from "@/lib/crises/rules/crisisRow";
import { resolveCrisisLocationName, interpolateLocation } from "@/lib/crises/crisisLocation";
import { CRISIS_TOOLTIPS, tooltipForEffect } from "@/lib/crises/tooltipCopy";
import { Tooltip } from "@/components/ui/Tooltip";
import { getSiteUrl } from "@/lib/siteMetadata";
import { getAuthAdmin, getAuthUserWithCharacter } from "@/lib/auth";
import CrisisInteractionPanel from "./CrisisInteractionPanel";
import CrisisAdminActions from "./CrisisAdminActions";
import CrisisV2Detail from "./CrisisV2Detail";
import { loadCrisisV2Detail } from "@/lib/crises/queries/crisisV2View";
import { statesCollection } from "@/lib/db/repositories/states";
import { crisesCollection } from "@/lib/db/repositories/crises";

const truncate = (s: string | undefined | null, max = 200) =>
  !s ? "" : s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

/**
 * Format a one-time GDP output loss as a money figure. `gdpMillions` is the summed
 * GDP (in millions) of the affected regions; `fraction` is the share destroyed.
 * Returns e.g. "$236bn" (or null when the affected GDP isn't known).
 */
function formatGdpLossDollars(fraction: number, gdpMillions: number): string | null {
  if (!Number.isFinite(gdpMillions) || gdpMillions <= 0) return null;
  const lostMillions = fraction * gdpMillions;
  if (lostMillions >= 1_000_000) return `$${(lostMillions / 1_000_000).toFixed(1)}tn`;
  if (lostMillions >= 1_000) return `$${Math.round(lostMillions / 1_000)}bn`;
  if (lostMillions >= 1) return `$${Math.round(lostMillions)}m`;
  return `$${(lostMillions * 1_000).toFixed(0)}k`;
}

/** Cadence label: ticks recur each turn, decay margin hits are one sustained-but-fading shock, flats fire once. */
function effectCadence(effectType: string): string {
  if (effectType === "tick") return "Per-turn";
  if (effectType === "decay") return "Sustained · fades";
  return "One-time";
}

/**
 * Current strength (0–1) of a fading effect at `turn`, mirroring the turn engine's
 * linear ramp (`tickDecayFactor` in crisisTurn.ts): full at onset → 0 at expiry.
 * Only `tick`/`decay` effects fade; flats are one-time so this returns 1 for them.
 */
function liveStrength(
  effectType: string,
  turn: number,
  startTurn: number,
  duration: number | null
): number {
  if (effectType !== "tick" && effectType !== "decay") return 1;
  if (duration === null || duration <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (turn - startTurn) / duration));
}

const SEV_DOT: Record<"low" | "medium" | "high", string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-zinc-400",
};
const SEV_TEXT: Record<"low" | "medium" | "high", string> = {
  high: "text-rose-500 dark:text-rose-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted",
};

/** One row in the Key Facts sidebar. */
function Fact({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <dt className="text-xs text-muted shrink-0 pt-0.5 flex items-center gap-1">
        {label}
        {tooltip && <Tooltip content={tooltip} />}
      </dt>
      <dd className="text-sm font-medium text-foreground text-right">{children}</dd>
    </div>
  );
}

const SEVERITY_META: Record<
  "low" | "medium" | "high",
  { label: string; accent: string; eyebrow: string; badge: string }
> = {
  high: {
    label: "Severe",
    accent: "from-rose-500/80 via-rose-500/30 to-transparent",
    eyebrow: "text-rose-300",
    badge: "border-rose-400/40 bg-rose-500/15 text-rose-200",
  },
  medium: {
    label: "Elevated",
    accent: "from-amber-400/80 via-amber-400/30 to-transparent",
    eyebrow: "text-amber-200",
    badge: "border-amber-300/40 bg-amber-400/15 text-amber-100",
  },
  low: {
    label: "Watch",
    accent: "from-zinc-300/60 via-zinc-300/20 to-transparent",
    eyebrow: "text-zinc-300",
    badge: "border-white/25 bg-white/10 text-zinc-100",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return {};

  const db = await getDb();
  const crisis = await crisesCollection(db).findOne(
    { _id: new ObjectId(id) },
    { projection: { name: 1, description: 1, scope: 1, countryIds: 1 } }
  );
  if (!crisis) return {};

  const scopeLabel =
    crisis.scope === "global"
      ? "Global crisis"
      : crisis.countryIds && crisis.countryIds.length > 0
        ? `${crisis.scope === "country" ? "Country" : "Regional"} crisis — ${crisis.countryIds.join(", ")}`
        : `${crisis.scope} crisis`;
  const title = `${crisis.name} | A House Divided`;
  const description = truncate(crisis.description) || scopeLabel;
  const url = `${getSiteUrl()}/world/crises/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      images: [{ url: CDN_LOGO_URL, width: 512, height: 512, alt: "A House Divided" }],
    },
    twitter: { card: "summary", title, description, images: [CDN_LOGO_URL] },
  };
}

export default async function CrisisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) notFound();

  const db = await getDb();
  const [crisis, gameState, admin, viewer] = await Promise.all([
    crisesCollection(db).findOne({ _id: new ObjectId(id) }),
    gameStateCollection(db).findOne(
      { _id: "current" },
      {
        projection: {
          currentTurn: 1,
          startingYear: 1,
          preIterationTurns: 1,
          "preIteration.active": 1,
        },
      }
    ),
    getAuthAdmin(),
    getAuthUserWithCharacter(),
  ]);

  if (!crisis) notFound();
  // Affected regions: the dollar value of a one-time GDP loss and the real
  // place names for the `{location}` flavor substitution.
  const stateFilter: Record<string, unknown> =
    crisis.scope === "region"
      ? { _id: { $in: crisis.regionIds } }
      : crisis.scope === "country"
        ? { countryId: { $in: crisis.countryIds }, regionType: { $nin: ["nation"] } }
        : {};
  const [v2Detail, affectedStates] = await Promise.all([
    loadCrisisV2Detail(
      db,
      crisis,
      viewer?.hasCharacter && viewer.character ? viewer.character._id : null
    ),
    crisis.scope === "global"
      ? Promise.resolve([] as Pick<State, "_id" | "name" | "gdp">[])
      : statesCollection(db)
          .find(stateFilter as never)
          .project<Pick<State, "_id" | "name" | "gdp">>({ name: 1, gdp: 1 })
          .toArray(),
  ]);
  const affectedGdpMillions = affectedStates.reduce((sum, s) => sum + (s.gdp ?? 0), 0);
  const locationName = await resolveCrisisLocationName(
    db,
    crisis,
    crisis.scope === "region"
      ? affectedStates.map((s) => s.name as string).filter(Boolean)
      : undefined
  );

  const isActive = crisis.status === "active";
  const startingYear = gameState?.startingYear ?? STARTING_YEAR;
  // Crisis turns are stored RAW. Without the founding-phase clock every date on
  // this page reads a game year ahead of the status bar (#1208).
  const clock = {
    preIterationTurns: gameState?.preIterationTurns,
    preIterationActive: gameState?.preIteration?.active,
  };
  const currentTurn = gameState?.currentTurn ?? crisis.startTurn;
  // Full names for every country, from the shared table; the old local map
  // knew four, so the list mixed names with bare codes.
  const targetCountryNames = crisis.countryIds
    .map((cId) => getCountryDisplayName(cId as CountryId))
    .join(", ");
  // Region display names (e.g. "California"), falling back to the raw id.
  const regionNameById = new Map(affectedStates.map((s) => [s._id, s.name as string]));
  const description = interpolateLocation(crisis.description, locationName);
  const wireOnStart = interpolateLocation(crisis.wireMessageOnStart, locationName);
  const wireOnEnd = crisis.wireMessageOnEnd
    ? interpolateLocation(crisis.wireMessageOnEnd, locationName)
    : null;
  // Largest single-effect impact, to scale the per-effect strength bars.
  const maxEffectImpact = crisis.effects.reduce((m, e) => Math.max(m, effectImpact(e)), 0);
  const severity = severityBandFromScore(v2Detail?.severity ?? crisisScoreFor(crisis, undefined));
  const heroSrc = crisisImageUrl(
    { name: crisis.name, templateKey: crisis.templateKey, kind: crisisKind(crisis) },
    1600
  );
  const sev = SEVERITY_META[severity];
  const scopeWord =
    crisis.scope === "country" ? "National" : crisis.scope === "region" ? "Regional" : "Global";

  const progress = crisisTurnProgress(crisis, currentTurn);

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-card-border bg-card shadow-lg">
          <div className="relative h-[175px] w-full sm:h-[220px]">
            <Image
              src={heroSrc}
              alt=""
              fill
              className={`object-cover object-center ${isActive ? "" : "grayscale"}`}
              priority
              unoptimized
              sizes="(max-width: 896px) 100vw, 896px"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25"
              aria-hidden
            />
            <div
              className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${
                isActive ? sev.accent : "from-muted/40 via-muted/20 to-transparent"
              }`}
              aria-hidden
            />
            <div className="absolute inset-0 flex flex-col justify-between px-5 sm:px-6 py-4 sm:py-5">
              <Link
                href="/world/crises"
                className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors w-fit"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to crises
              </Link>
              <div>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                    isActive ? sev.eyebrow : "text-zinc-400"
                  }`}
                >
                  {scopeWord} crisis{isActive ? ` · ${sev.label}` : ""}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight text-balance">
                  {crisis.name}
                </h1>
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      isActive
                        ? "border-amber-300/40 bg-amber-500/15 text-amber-100"
                        : "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                    }`}
                  >
                    {isActive ? "Active" : "Resolved"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-white/25 bg-black text-zinc-100 font-medium">
                    {scopeWord}
                  </span>
                  {isActive && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sev.badge}`}
                    >
                      {sev.label}
                    </span>
                  )}
                  <span className="text-xs text-white/60 ml-0.5">
                    Started {rawTurnToLarpDate(crisis.startTurn, startingYear, clock)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Body: main column + sticky sidebar */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
          {/* Main column */}
          <div className="space-y-6 min-w-0">
            {/* Admin actions (resolve) */}
            {admin && <CrisisAdminActions crisisId={id} status={crisis.status} />}
            {/* Situation */}
            <div className="relative overflow-hidden rounded-xl border border-card-border bg-card p-6 shadow-card">
              <div
                className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${
                  isActive ? sev.accent : "from-muted/40 to-transparent"
                }`}
                aria-hidden
              />
              <p className="text-body-sm font-medium text-muted mb-2 flex items-center gap-1">
                The situation
                <Tooltip content={CRISIS_TOOLTIPS.wire} />
              </p>
              <p className="text-[15px] text-foreground/85 leading-relaxed">{description}</p>
            </div>

            {/* Wire messages */}
            {wireOnStart && (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-5 py-4">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
                  Breaking wire
                  <Tooltip content={CRISIS_TOOLTIPS.wire} />
                </p>
                <p className="text-sm italic text-foreground/80 leading-relaxed">
                  &ldquo;{wireOnStart}&rdquo;
                </p>
              </div>
            )}
            {crisis.status === "resolved" && wireOnEnd && (
              <div className="rounded-xl border border-card-border bg-card px-5 py-4">
                {/* Same label style as the breaking wire, in the resolved colour. */}
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-success mb-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                  Resolution wire
                </p>
                <p className="text-sm italic text-muted leading-relaxed">
                  &ldquo;{wireOnEnd}&rdquo;
                </p>
              </div>
            )}

            {v2Detail && <CrisisV2Detail crisisId={id} detail={v2Detail} />}

            {/* Interactive decision panel (interactive crises only) */}
            {crisis.interactionDefinition && <CrisisInteractionPanel crisisId={id} />}

            {/* Effects: only when there are some; "0 effects" over an empty
                list said nothing. */}
            {crisis.effects.length > 0 && (
              <div className="rounded-xl border border-card-border bg-card shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-card-border">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1">
                    Effects
                    <Tooltip content={CRISIS_TOOLTIPS.effects} />
                    <span className="ml-1 text-xs font-normal text-muted">
                      {crisis.effects.length} {crisis.effects.length === 1 ? "effect" : "effects"}
                    </span>
                  </h2>
                  {crisis.durationTurns &&
                  crisis.effects.some((effect) => effect.effectType === "tick") ? (
                    <p className="mt-0.5 text-xs text-muted">
                      Per-turn effects start at full strength and fall by the same amount each turn,
                      reaching zero at expiry. Estimated totals assume the full scheduled duration.
                    </p>
                  ) : null}
                </div>
                <ul className="divide-y divide-card-border/60">
                  {crisis.effects.map((effect, i) => {
                    const display = describeCrisisEffect(effect);
                    // Colour follows whether the move hurts; the arrow follows the sign.
                    const negative = display.tone === "bad";
                    const pointsDown = effect.targetType === "gdpLoss" || effect.value < 0;
                    const isGdpLoss = effect.targetType === "gdpLoss";
                    const isTick = effect.effectType === "tick";
                    const fades = isTick || effect.effectType === "decay";
                    const strength =
                      isActive && fades
                        ? liveStrength(
                            effect.effectType,
                            currentTurn,
                            crisis.startTurn,
                            crisis.durationTurns
                          )
                        : 1;
                    // Cumulative drag of a per-turn tick over the whole crisis: the
                    // decay ramp sums to value × (duration+1)/2 (≈6.5× at D=12). Shown
                    // so a small per-turn number reads comparably to a one-time flat.
                    const cumulativeTick =
                      isTick && crisis.durationTurns
                        ? (effect.value * (crisis.durationTurns + 1)) / 2
                        : null;
                    const amountAt = (value: number) =>
                      describeCrisisEffect({ ...effect, value }).amount;
                    const pct = Math.abs(effect.value) * 100;
                    const dollars = isGdpLoss
                      ? formatGdpLossDollars(Math.abs(effect.value), affectedGdpMillions)
                      : null;
                    const barPct =
                      maxEffectImpact > 0
                        ? Math.max(
                            4,
                            Math.min(
                              100,
                              Math.round((effectImpact(effect) / maxEffectImpact) * 100)
                            )
                          )
                        : 0;
                    return (
                      <li key={i} className="px-5 py-3 hover:bg-card-elevated transition-colors">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                              negative
                                ? "border-error/30 bg-error/5 text-error"
                                : "border-success/30 bg-success/5 text-success"
                            }`}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d={
                                  pointsDown
                                    ? "M19 14l-7 7m0 0l-7-7m7 7V3"
                                    : "M5 10l7-7m0 0l7 7m-7-7v18"
                                }
                              />
                            </svg>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                              {display.target}
                              <Tooltip content={tooltipForEffect(effect)} />
                            </p>
                            <p className="text-xs text-muted flex items-center gap-1">
                              {effect.label}
                              <Tooltip
                                content={
                                  effect.effectType === "tick"
                                    ? CRISIS_TOOLTIPS["effect-type"]
                                    : CRISIS_TOOLTIPS["effect-target"]
                                }
                              />
                              · {effectCadence(effect.effectType)}
                              {isActive && fades && (
                                <span className="text-muted/80">
                                  {" "}
                                  · {Math.round(strength * 100)}% strength now
                                </span>
                              )}
                            </p>
                          </div>
                          {isGdpLoss ? (
                            <div className="text-right shrink-0">
                              <span className="block font-mono text-sm font-semibold tabular-nums text-error">
                                {pct % 1 === 0 ? pct : pct.toFixed(1)}% of GDP
                              </span>
                              {dollars && (
                                <span className="block text-[11px] text-error/80 tabular-nums">
                                  −{dollars} lost
                                </span>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`font-mono text-sm font-semibold tabular-nums shrink-0 text-right ${
                                negative ? "text-error" : "text-success"
                              }`}
                            >
                              {cumulativeTick != null
                                ? `Starts at ${display.amount}`
                                : display.amount}
                              {cumulativeTick != null && (
                                <span className="block text-[11px] font-normal text-muted">
                                  ≈ {amountAt(cumulativeTick)} total over {crisis.durationTurns}{" "}
                                  turns
                                </span>
                              )}
                              {!isTick && isActive && fades && strength < 1 && (
                                <span className="block text-[11px] font-normal text-muted">
                                  {amountAt(effect.value * strength)} now
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Relative-impact strength bar */}
                        <div className="mt-2 ml-10 h-1 rounded-full bg-card-elevated overflow-hidden">
                          <div
                            className={`h-full rounded-full ${negative ? "bg-error/70" : "bg-success/70"}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-xl border border-card-border bg-card shadow-card overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-body-sm font-medium text-muted">Key facts</p>
              </div>
              <dl className="divide-y divide-card-border/60">
                <Fact label="Status" tooltip={CRISIS_TOOLTIPS.status}>
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      // An active crisis is a warning; a resolved one is good news.
                      isActive ? "text-warning" : "text-success"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isActive ? "bg-warning" : "bg-success"
                      }`}
                    />
                    {isActive ? "Active" : "Resolved"}
                  </span>
                </Fact>
                <Fact label="Scope" tooltip={CRISIS_TOOLTIPS.scope}>
                  {scopeWord}
                </Fact>
                {isActive && (
                  <Fact label="Severity" tooltip={CRISIS_TOOLTIPS.severity}>
                    <span className={`inline-flex items-center gap-1.5 ${SEV_TEXT[severity]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[severity]}`} />
                      {sev.label}
                    </span>
                  </Fact>
                )}
                <Fact label="Started" tooltip={CRISIS_TOOLTIPS.started}>
                  {rawTurnToLarpDate(crisis.startTurn, startingYear, clock)}
                  <span className="block text-xs font-normal text-muted">
                    Turn {crisis.startTurn}
                  </span>
                </Fact>
                {crisis.status === "resolved" && crisis.endTurn ? (
                  <Fact label="Ended" tooltip={CRISIS_TOOLTIPS.ended}>
                    {rawTurnToLarpDate(crisis.endTurn, startingYear, clock)}
                    <span className="block text-xs font-normal text-muted">
                      Turn {crisis.endTurn}
                    </span>
                  </Fact>
                ) : crisis.durationTurns ? (
                  <Fact label="Ends" tooltip={CRISIS_TOOLTIPS.duration}>
                    {rawTurnToLarpDate(
                      crisis.startTurn + crisis.durationTurns,
                      startingYear,
                      clock
                    )}
                    <span className="block text-xs font-normal text-muted">
                      {crisis.durationTurns} turns total
                    </span>
                  </Fact>
                ) : (
                  <Fact label="Duration" tooltip={CRISIS_TOOLTIPS.duration}>
                    <span className="text-success">Ongoing</span>
                  </Fact>
                )}
                {crisis.countryIds.length > 0 && (
                  <Fact label="Countries" tooltip={CRISIS_TOOLTIPS.countries}>
                    {targetCountryNames}
                  </Fact>
                )}
                {crisis.regionIds.length > 0 && (
                  <Fact
                    label={crisis.regionIds.length === 1 ? "Region" : "Regions"}
                    tooltip={CRISIS_TOOLTIPS.regions}
                  >
                    {crisis.regionIds.map((rId) => regionNameById.get(rId) ?? rId).join(", ")}
                  </Fact>
                )}
              </dl>

              {progress && (
                <div className="px-4 py-3 border-t border-card-border">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted">Progress</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {progress.elapsed} elapsed · {progress.remaining} remaining · {progress.total}{" "}
                      turns total
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-card-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full ${SEV_DOT[severity]}`}
                      style={{ width: `${Math.round((progress.elapsed / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
