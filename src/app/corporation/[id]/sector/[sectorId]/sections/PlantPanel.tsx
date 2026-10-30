"use client";

import { useTranslations } from "next-intl";
import { COLD_CAPACITY_UPKEEP_FRACTION } from "@/lib/corporations/investment/rules";
import CapacityRecovery from "../components/CapacityRecovery";
import type { ReactNode } from "react";
import Link from "next/link";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui";
import { UnionEmblem } from "@/components/unions/UnionEmblem";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Factory, Hammer, PauseCircle, PlayCircle, ShieldCheck, X } from "lucide-react";
import type { CommodityFlow, PlantsData } from "../types";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import type {
  ManufacturingIndustryModel,
  MediaDiscriminator,
} from "@/lib/constants/corporationsClient";
import {
  capitalizeFacility,
  facilityPlural,
  facilitySingular,
  facilityVocabulary,
} from "@/lib/constants/facilityVocabulary";
import RunMeter from "../components/RunMeter";
import StateLabourPool from "../components/StateLabourPool";
import type { StateLabourPoolView } from "@/lib/labour/rules/stateLabourPool";
import DetailsDisclosure from "../components/DetailsDisclosure";
import { fmtUnits, fmtPct } from "../lib/plants";
import { plantSizeForSector, plantsFromUnitsForSector } from "@/lib/constants/facilityQuantum";
import { estimateSectorFullCapacityOneHopFreightTeu } from "@/lib/logistics/freightVisibility";

interface PlantPanelProps {
  plants: PlantsData;
  /** Commodity-ledger output after media, embargo and other market scaling. */
  marketSupplies?: CommodityFlow[];
  freightState?: { observedLoad: number; capacity: number; turn: number | null };
  /** Drives the facility noun. A retail sector says "stores", not "plants". */
  sectorType: OperatingSectorType;
  /** Manufacturing production model, e.g. "vehicles", which sets the facility size. */
  industryModel?: ManufacturingIndustryModel | null;
  mediaDiscriminator?: MediaDiscriminator | null;
  mediaAdvertisingCampaignFactor?: number;
  /** The national industry union covering this workforce, vacant or led. */
  unionId?: string | null;
  unionName?: string | null;
  /** Worker-wide wage multiplier for this local, where 1.00 is baseline. */
  averageWageLevel: number;
  /** The state's shared labour pool, shown when this sector has unfilled jobs. */
  stateLabourMarket?: StateLabourPoolView | null;
  stateName?: string;
  isCeo: boolean;
  /** True while any capacity command is in flight. */
  busy: boolean;
  /** Last capacity-command error, or empty. */
  message: string;
  onOpenBuild: () => void;
  onCancelOrder: (orderIndex: number) => void;
  onMothball: () => void;
  onReactivate: () => void;
  onResize?: (activePercent: number) => void;
}

/**
 * The plant panel. Replaces the capital panel under `marketSystemMode >=
 * "plants"`, where capacity is not a haircut on a revenue nameplate but THE
 * thing the sector is.
 *
 * Design plan (two-pass, per the design-system skill):
 *   Palette   dominant card neutrals; `primary` spent in exactly one place (the
 *             Build CTA). success/warning/muted carry the run meter.
 *   Type      one display-scale number: the plant count. Everything else
 *             is body scale. The number IS the game object.
 *   Layout    hero number + run meter across the full width, then a 2-column
 *             grid of workforce / depreciation / queue.
 *   Signature the run meter with named idle causes.
 */
export default function PlantPanel({
  plants,
  marketSupplies = [],
  freightState,
  sectorType,
  industryModel,
  mediaDiscriminator,
  mediaAdvertisingCampaignFactor = 1,
  unionId,
  unionName,
  averageWageLevel,
  stateLabourMarket,
  stateName,
  isCeo,
  busy,
  message,
  onOpenBuild,
  onCancelOrder,
  onMothball,
  onReactivate,
  onResize,
}: PlantPanelProps) {
  const t = useTranslations("corporations.sectorInvestment");
  // One sizing for the hero, the stat and the queue, shared with the build
  // dialog and the persisted ledger, so a vehicle recipe counts vehicle plants.
  const plantSizing = {
    sectorType,
    industryModel,
    mediaDiscriminator,
    strategyId: plants.strategyId,
  };
  const unitsPerPlant = plantSizeForSector(plantSizing);
  const ownedPlantCount =
    plants.plantCount ?? plantsFromUnitsForSector(plantSizing, plants.capacityUnits ?? 0);
  // Per order: plants ordered, plants finished (whole ones only, so a plant
  // a third built is not counted as built), and the rest still being built.
  const orderPlants = (o: { unitsOrdered: number; unitsDelivered: number }) => {
    const ordered = plantsFromUnitsForSector(plantSizing, o.unitsOrdered);
    const built = Math.min(ordered, Math.floor(Math.max(0, o.unitsDelivered) / unitsPerPlant));
    return { ordered, built, building: ordered - built };
  };
  const plantsBeingBuilt = plants.buildQueue.reduce((s, o) => s + orderPlants(o).building, 0);
  const { formatAmount } = useCurrency();
  const vocab = facilityVocabulary(sectorType);
  const sites = facilityPlural(sectorType);
  const money = (anchor: number) => formatAmount(anchor);
  const mothballed = plants.mothballed;
  const idleRetirement = plants.idleRetirement;
  const hasRun = plants.producedUnits != null;
  const workersDesired = plants.workersDesired ?? plants.workers;
  const labourStaffingFactor =
    plants.labourStaffingFactor ??
    (workersDesired > 0 ? Math.min(1, plants.workers / workersDesired) : 1);
  const staffingShortfall =
    workersDesired > 0 && plants.workers < workersDesired ? 1 - plants.workers / workersDesired : 0;
  const mediaAdvertisingSupply =
    sectorType === "media" && mediaDiscriminator !== "entertainment"
      ? marketSupplies.find((supply) => supply.commodity === "advertising")
      : undefined;
  const primaryMediaSupply =
    sectorType === "media"
      ? (mediaAdvertisingSupply ?? marketSupplies.find((supply) => supply.units > 0))
      : undefined;
  const mediaLedgerShare =
    hasRun && primaryMediaSupply && (plants.producedUnits ?? 0) > 0
      ? primaryMediaSupply.units / (plants.producedUnits ?? 1)
      : null;
  const fullCapacityFreightEstimate = estimateSectorFullCapacityOneHopFreightTeu({
    stateId: "",
    producedUnits: plants.producedUnits,
    capacityUnits: plants.capacityUnits,
    outputByCommodity: Object.fromEntries(
      marketSupplies.map((supply) => [supply.commodity, supply.units])
    ),
  });
  const countedCampaigns =
    sectorType === "media" && mediaDiscriminator !== "entertainment" && hasRun
      ? (mediaAdvertisingSupply?.units ?? 0)
      : null;

  return (
    <div
      className={`rounded-xl border bg-card p-6 shadow-card transition-opacity ${
        mothballed ? "border-muted/40" : "border-card-border"
      }`}
    >
      {/* Header ─────────────────────────────────────────────────────────────*/}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-heading-sm font-bold text-foreground">
            <Factory className="h-4 w-4 text-muted" aria-hidden />
            Your {sites}
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            Your {sites} are what you own here. They make things, you sell them, that is your
            income.
          </p>
          {(fullCapacityFreightEstimate != null || freightState) && (
            <div className="mt-2 max-w-2xl space-y-1 text-body-xs text-muted">
              {freightState && (
                <p>
                  {t("freightState", {
                    load: fmtUnits(freightState.observedLoad),
                    turnLabel:
                      freightState.turn == null
                        ? ""
                        : t("freightStateTurn", { turn: freightState.turn }),
                    capacity: fmtUnits(freightState.capacity),
                  })}
                </p>
              )}
              {fullCapacityFreightEstimate != null && (
                <p>
                  {t("freightOneHopEstimate", {
                    estimate: fmtUnits(fullCapacityFreightEstimate),
                  })}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mothballed && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-muted/40 bg-muted/10 px-2.5 py-1 text-body-xs font-semibold uppercase tracking-wide text-muted">
              <PauseCircle className="h-3 w-3" aria-hidden /> Mothballed
            </span>
          )}
          {plants.governor.active && (
            <InfoTooltip
              width={280}
              trigger={
                <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-info/30 bg-info/10 px-2.5 py-1 text-body-xs font-semibold uppercase tracking-wide text-info">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Market support ·{" "}
                  {plants.governor.turnsRemaining}
                </span>
              }
            >
              <p className="mb-1 font-semibold text-foreground">Market support</p>
              <p className="text-muted">
                This sector recently moved onto the new market. For {plants.governor.turnsRemaining}{" "}
                more turns your income is held close to what it was, so a bad first week cannot wipe
                you out. The support fades to nothing over that time.
              </p>
            </InfoTooltip>
          )}
        </div>
      </div>

      {/* Hero: capacity + today's run ───────────────────────────────────────*/}
      <div
        className={`rounded-lg border border-card-border bg-card-muted/60 p-5 ${
          mothballed ? "opacity-70" : ""
        }`}
      >
        <p className="text-body-sm font-medium text-muted">
          {capitalizeFacility(sites)} {mothballed ? "in cold storage" : "running"}
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-display font-bold tabular-nums text-foreground">
            {fmtUnits(ownedPlantCount)}
          </span>
          <InfoTooltip
            width={260}
            trigger={
              <span className="cursor-help border-b border-dotted border-muted/40 text-body-sm text-muted">
                {ownedPlantCount === 1 ? facilitySingular(sectorType) : sites}
              </span>
            }
          >
            <p className="text-muted">
              Together they can make {fmtUnits(plants.capacityUnits)} units a day. One{" "}
              {facilitySingular(sectorType)} makes about {fmtUnits(unitsPerPlant)}.
            </p>
          </InfoTooltip>
          {plantsBeingBuilt > 0 && (
            <span className="text-body-sm text-muted">
              · {fmtUnits(plantsBeingBuilt)} more being built
            </span>
          )}
        </p>

        <p className="mb-2 mt-5 text-body-sm font-medium text-muted">Today&apos;s run</p>
        {hasRun ? (
          <>
            <RunMeter
              capacityUnits={plants.capacityUnits ?? 0}
              producedUnits={plants.producedUnits ?? 0}
              soldUnits={plants.soldUnits ?? 0}
              idleCauses={plants.idleCauses}
              sectorType={sectorType}
              localMarketOutputs={plants.localMarketOutputs}
              dimmed={mothballed}
            />
            {primaryMediaSupply && (
              <div className="mt-3 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-body-xs text-foreground">
                <p className="font-semibold">
                  Commodity ledger output: {primaryMediaSupply.label}{" "}
                  {fmtUnits(primaryMediaSupply.units)} {primaryMediaSupply.unit}/day
                  {mediaLedgerShare != null ? ` (${fmtPct(mediaLedgerShare)} of today's run)` : ""}
                </p>
                <p className="mt-1 text-muted">
                  {mediaDiscriminator === "entertainment"
                    ? t("mediaEntertainmentExplanation")
                    : t("mediaAdvertisingExplanation")}
                </p>
              </div>
            )}
            {countedCampaigns != null && (
              <p className="mt-2 text-body-xs text-muted">
                {t("advertisingCampaignsCounted", {
                  units: fmtUnits(countedCampaigns),
                  factor: fmtPct(mediaAdvertisingCampaignFactor),
                })}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-card-border px-3 py-4 text-center text-body-sm text-muted">
            Your first run shows here after the next turn.
          </p>
        )}
      </div>

      {isCeo && !mothballed && idleRetirement && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-foreground">
          {idleRetirement.retiredUnits > 0 ? (
            <p>
              About{" "}
              {fmtUnits(
                idleRetirement.retiredUnits / unitsPerPlant,
                idleRetirement.retiredUnits / unitsPerPlant < 10 ? 1 : 0
              )}{" "}
              {sites}&apos; worth of output retired last turn because buyers here have not taken it
              for {idleRetirement.turns} turns. Retirement continues a little each turn until your{" "}
              {sites} are close to what they sell. Parked {sites} are not retired
              {onResize ? ", so park any you want to keep" : ""}.
            </p>
          ) : (
            <p>
              Sales here are below this plant&apos;s run. If that lasts{" "}
              {Math.max(1, idleRetirement.graceTurns - idleRetirement.turns + 1)} more turn
              {idleRetirement.graceTurns - idleRetirement.turns === 0 ? "" : "s"}, unused output
              starts to retire a little each turn.
              {onResize ? ` Park ${sites} below to keep them.` : ""}
            </p>
          )}
        </div>
      )}

      {mothballed && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-muted/40 bg-muted/10 p-4">
          <p className="text-body-sm text-foreground">
            {capitalizeFacility(sites)} here are in cold storage. They make nothing and pay{" "}
            {fmtPct(COLD_CAPACITY_UPKEEP_FRACTION)} of normal upkeep. Turn them back on when you
            want to run again.
          </p>
          {isCeo && (
            <Button variant="primary" size="sm" onClick={onReactivate} isLoading={busy}>
              <PlayCircle className="mr-1.5 h-4 w-4" aria-hidden /> Turn {sites} back on
            </Button>
          )}
        </div>
      )}

      {/* Stats grid ────────────────────────────────────────────────────────*/}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Workforce"
          value={fmtUnits(plants.workers)}
          sub={
            <div className="space-y-1">
              <span className="block">
                {plants.unionizationPct > 0
                  ? `${plants.unionizationPct.toFixed(0)}% in a union`
                  : "No union pressure"}
              </span>
              {unionId && unionName && (
                <Link
                  href={`/unions/${unionId}`}
                  title={unionName}
                  className="flex min-w-0 items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
                >
                  <UnionEmblem name={unionName} sectorType={sectorType} size="xs" />
                  <span className="line-clamp-2">{unionName}</span>
                </Link>
              )}
              <span className="block tabular-nums">
                Avg wage level {averageWageLevel.toFixed(2)}×
              </span>
              {staffingShortfall > 0.001 && (
                <span className="block tabular-nums text-warning">
                  {fmtUnits(plants.workers)} of {fmtUnits(workersDesired)} jobs filled (
                  {fmtPct(labourStaffingFactor)})
                </span>
              )}
            </div>
          }
          help={`Workers staffing your ${sites}. Each ${facilitySingular(sectorType)} needs about ${fmtUnits(plants.laborIntensity * unitsPerPlant)} workers.`}
        />
        <Stat
          label="Wear and tear"
          value={`−${(plants.depreciationPerTurn * 100).toFixed(2)}%`}
          sub="per turn"
          help={`The share of your ${sites}' output that wears out every turn if you do not invest. Build at least this much to stand still.`}
        />
        <Stat
          label="Being built"
          value={fmtUnits(plantsBeingBuilt)}
          sub={
            plants.constructionInProgressAnchor > 0
              ? `${money(plants.constructionInProgressAnchor)} paid`
              : "nothing on order"
          }
          help={`${vocab.plural.charAt(0).toUpperCase()}${vocab.plural.slice(1)} you have paid for that are still under construction. They arrive a few at a time and are finished on the turn shown in the build list.`}
        />
      </div>

      {staffingShortfall > 0.001 &&
        (stateLabourMarket ? (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-body-sm text-foreground">
            <p className="mb-2 font-semibold">Local worker shortage is limiting this run.</p>
            <StateLabourPool pool={stateLabourMarket} stateName={stateName ?? "this state"} />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-body-sm text-foreground">
            Local worker shortage is limiting this run. Higher pay can win a larger share of the
            available workforce, while participation and migration respond gradually over future
            turns.
          </p>
        ))}

      {/* Build queue ───────────────────────────────────────────────────────*/}
      {plants.buildQueue.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-body-sm font-medium text-muted">Under construction</p>
          <ul className="space-y-2">
            {plants.buildQueue.map((o) => {
              // Smooth orders deliver a linear slice of capacity every turn
              // across [startTurn, onlineTurn] (buildDelivery.ts). Show the
              // rate so the queue reads as a ramp, not a binary wait.
              const buildWindow = o.onlineTurn - o.startTurn;
              const unitsPerTurn =
                o.smooth && buildWindow > 0 ? o.unitsOrdered / buildWindow : null;
              // Everything a player orders is a FACILITY. Capacity units are the
              // engine's internal measure of what a facility produces, and
              // quoting the queue in them read as though you were buying units
              // of output directly.
              const { ordered: sitesOrdered, built: sitesDelivered } = orderPlants(o);
              const sitesPerTurn = unitsPerTurn != null ? unitsPerTurn / unitsPerPlant : null;
              const orderedNoun = sitesOrdered === 1 ? vocab.singular : vocab.plural;
              return (
                <li
                  key={`${o.orderIndex}-${o.startTurn}`}
                  className="rounded-lg border border-card-border bg-background/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-foreground">
                        {o.smooth && o.turnsRemaining > 0
                          ? `${fmtUnits(sitesDelivered)} of ${fmtUnits(sitesOrdered)} ${orderedNoun} built`
                          : `${fmtUnits(sitesOrdered)} ${orderedNoun}`}
                      </p>
                      <p className="text-body-xs text-muted">
                        {o.turnsRemaining > 0
                          ? sitesPerTurn != null
                            ? `about ${fmtUnits(sitesPerTurn, sitesPerTurn < 10 ? 1 : 0)} ${sitesPerTurn === 1 ? vocab.singular : vocab.plural} arriving each turn · done on turn ${o.onlineTurn} (${o.turnsRemaining} to go) · ${money(o.costPaidAnchor)} paid`
                            : `ready on turn ${o.onlineTurn} (${o.turnsRemaining} to go) · ${money(o.costPaidAnchor)} paid`
                          : `arrives next turn · ${money(o.costPaidAnchor)} paid`}
                      </p>
                    </div>
                    {isCeo && o.turnsRemaining > 0 && (
                      <button
                        type="button"
                        onClick={() => onCancelOrder(o.orderIndex)}
                        disabled={busy}
                        title="Cancel this build. You keep what is already built and get 75% of what you paid for the unbuilt part back."
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-card-border px-2 py-1 text-body-xs font-medium text-muted transition-colors hover:border-error/40 hover:text-error disabled:opacity-40"
                      >
                        <X className="h-3 w-3" aria-hidden /> Cancel
                      </button>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-track">
                    <div
                      className="h-full bg-info transition-[width] duration-500"
                      style={{ width: `${o.progress * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-body-xs text-muted">{t("cancelHelp")}</p>
        </div>
      )}

      {message && (
        <p className="mt-4 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
          {message}
        </p>
      )}

      {/* Actions ───────────────────────────────────────────────────────────*/}
      {isCeo && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-card-border pt-4">
          <Button variant="primary" onClick={onOpenBuild} disabled={busy}>
            <Hammer className="mr-1.5 h-4 w-4" aria-hidden /> {capitalizeFacility(vocab.buildVerb)}{" "}
            more {sites}
          </Button>
          {!mothballed && (
            <Button variant="secondary" onClick={onMothball} disabled={busy}>
              <PauseCircle className="mr-1.5 h-4 w-4" aria-hidden /> Mothball
            </Button>
          )}
          <p className="w-full text-body-xs text-muted sm:w-auto sm:flex-1">
            {t("mothballHelp", { percent: COLD_CAPACITY_UPKEEP_FRACTION * 100 })}
          </p>
        </div>
      )}

      {isCeo && onResize && (
        <CapacityRecovery
          key={`${plants.mothballed}:${plants.activeCapacityPercent}`}
          plants={plants}
          busy={busy}
          onResize={onResize}
        />
      )}

      <DetailsDisclosure className="mt-4">
        <dl className="space-y-1.5 text-body-sm">
          <DetailRow label="Made this turn" value={`${fmtUnits(plants.producedUnits)} units`} />
          <DetailRow label="Sold this turn" value={`${fmtUnits(plants.soldUnits)} units`} />
          <DetailRow label="Share that sold" value={fmtPct(plants.fillRate)} />
          <DetailRow label="Idle capacity" value={`${fmtUnits(plants.idleUnits)} units`} />
          <DetailRow label="Staff per unit of capacity" value={plants.laborIntensity.toFixed(3)} />
          <DetailRow
            label="Untapped demand here"
            value={`${fmtUnits(plants.headroomUnits)} units/day`}
          />
          <DetailRow label="Turn" value={`${plants.currentTurn}`} />
        </dl>
      </DetailsDisclosure>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  help,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  help: string;
}) {
  return (
    <div className="rounded-lg border border-card-border bg-background/40 p-3">
      <InfoTooltip
        width={260}
        trigger={
          <span className="cursor-help border-b border-dotted border-muted/40 text-sm font-semibold text-foreground">
            {label}
          </span>
        }
      >
        <p className="mb-1 font-semibold text-foreground">{label}</p>
        <p className="text-muted">{help}</p>
      </InfoTooltip>
      <p className="mt-1 text-body-lg font-bold tabular-nums text-foreground">{value}</p>
      <div className="text-body-xs text-muted">{sub}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
