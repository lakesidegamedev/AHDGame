"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import {
  BULK_BUILD_MAX_FACILITIES,
  BULK_BUILD_MAX_SECTORS,
  selectBulkBuildSectors,
  type BulkBuildRule,
} from "@/lib/corporations/rules/bulkBuildCapacity";
import { formatUnits } from "../plantsPresentation";

/** The fields of a holding this dialog reads. */
export interface BulkBuildSectorOption {
  _id: string;
  stateId: string;
  stateName: string;
  countryId?: string;
  sectorType: string;
  mothballed?: boolean;
}

/** One row of the bulk-build response, preview or result. */
export interface BulkBuildRow {
  sectorId: string;
  stateId: string;
  countryId: string;
  sectorType: string;
  capacityUnits: number;
  units: number;
  costLocal: number;
  understaffed: boolean;
  status: "ready" | "over_budget" | "blocked" | "built" | "skipped";
  reason: string | null;
}

export interface BulkBuildResponse {
  mode: "preview" | "apply";
  cashLocal?: number;
  readyCount?: number;
  readyCostLocal?: number;
  cashAfterLocal?: number;
  builtCount?: number;
  spentLocal?: number;
  rows: BulkBuildRow[];
}

export type BulkBuildRequestFn = (body: {
  countryId: string | null;
  sectorType: string | null;
  rule: BulkBuildRule;
  mode: "preview" | "apply";
  maxTotalLocal?: number;
}) => Promise<{ ok: true; data: BulkBuildResponse } | { ok: false; error: string }>;

interface BulkBuildCapacityDialogProps {
  open: boolean;
  onClose: () => void;
  sectors: BulkBuildSectorOption[];
  homeCountry: string;
  countryLabel: (countryId: string) => string;
  /** Formats an amount in the corporation's own currency. */
  fmt: (local: number) => string;
  /** Corporation cash in its own currency, shown before the first preview. */
  cashLocal: number;
  onRequest: BulkBuildRequestFn;
  /** Called after an apply that built at least one sector. */
  onApplied: () => void;
}

const ALL = "*";

const STATUS_LABEL: Record<BulkBuildRow["status"], string> = {
  ready: "Will build",
  over_budget: "Not enough cash",
  blocked: "Cannot build",
  built: "Built",
  skipped: "Skipped",
};

const STATUS_TONE: Record<BulkBuildRow["status"], string> = {
  ready: "text-success",
  over_budget: "text-warning",
  blocked: "text-muted",
  built: "text-success",
  skipped: "text-warning",
};

const selectClass =
  "h-9 rounded-lg border border-card-border bg-background px-2 text-body-sm text-foreground focus:border-foreground focus:outline-none";

/**
 * Build capacity across many sectors at once. Pick a country and a sector
 * type, choose how much to build in each, see the price of every sector, then
 * confirm the exact total. Each sector is priced and built by the same
 * command as its own Build button.
 */
export default function BulkBuildCapacityDialog({
  open,
  onClose,
  sectors,
  homeCountry,
  countryLabel,
  fmt,
  cashLocal,
  onRequest,
  onApplied,
}: BulkBuildCapacityDialogProps) {
  const [country, setCountry] = useState(ALL);
  const [sectorType, setSectorType] = useState(ALL);
  const [ruleKind, setRuleKind] = useState<BulkBuildRule["kind"]>("facilities");
  const [facilities, setFacilities] = useState("1");
  const [percent, setPercent] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<BulkBuildResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkBuildResponse | null>(null);

  const stateNames = useMemo(() => new Map(sectors.map((s) => [s._id, s.stateName])), [sectors]);
  const countries = useMemo(() => {
    const ids = [...new Set(sectors.map((s) => s.countryId ?? homeCountry))];
    return ids.sort((a, b) =>
      a === homeCountry ? -1 : b === homeCountry ? 1 : a.localeCompare(b)
    );
  }, [sectors, homeCountry]);
  const types = useMemo(
    () =>
      [...new Set(sectors.map((s) => s.sectorType))].sort((a, b) =>
        typeLabel(a).localeCompare(typeLabel(b))
      ),
    [sectors]
  );
  const matched = useMemo(
    () =>
      selectBulkBuildSectors(
        sectors.map((s) => ({
          sectorId: s._id,
          countryId: s.countryId ?? homeCountry,
          sectorType: s.sectorType,
          stateId: s.stateId,
        })),
        {
          countryId: country === ALL ? null : country,
          sectorType: sectorType === ALL ? null : sectorType,
        }
      ).length,
    [sectors, homeCountry, country, sectorType]
  );

  const rule: BulkBuildRule | null =
    ruleKind === "facilities"
      ? wholeIn(facilities, 1, BULK_BUILD_MAX_FACILITIES) != null
        ? { kind: "facilities", count: wholeIn(facilities, 1, BULK_BUILD_MAX_FACILITIES)! }
        : null
      : wholeIn(percent, 1, 100) != null
        ? { kind: "percent", percent: wholeIn(percent, 1, 100)! }
        : null;

  /** Any change to the selection invalidates the quote the CEO is looking at. */
  function invalidate() {
    setPreview(null);
    setConfirming(false);
    setResult(null);
    setError("");
  }

  function close() {
    if (busy) return;
    invalidate();
    onClose();
  }

  async function runPreview() {
    if (!rule) return;
    setBusy(true);
    setError("");
    setResult(null);
    setConfirming(false);
    const r = await onRequest({
      countryId: country === ALL ? null : country,
      sectorType: sectorType === ALL ? null : sectorType,
      rule,
      mode: "preview",
    });
    setBusy(false);
    if (r.ok) setPreview(r.data);
    else {
      setPreview(null);
      setError(r.error);
    }
  }

  async function runApply() {
    if (!rule || !preview) return;
    setBusy(true);
    setError("");
    const r = await onRequest({
      countryId: country === ALL ? null : country,
      sectorType: sectorType === ALL ? null : sectorType,
      rule,
      mode: "apply",
      maxTotalLocal: preview.readyCostLocal,
    });
    setBusy(false);
    setConfirming(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPreview(null);
    setResult(r.data);
    if ((r.data.builtCount ?? 0) > 0) onApplied();
  }

  const shown = result ?? preview;
  const readyCount = preview?.readyCount ?? 0;
  const readyCost = preview?.readyCostLocal ?? 0;
  const cash = preview?.cashLocal ?? cashLocal;
  const tooMany = matched > BULK_BUILD_MAX_SECTORS;

  return (
    <Modal
      open={open}
      onClose={close}
      scrollable
      maxWidthClass="max-w-3xl max-h-[calc(100dvh-4rem)] flex flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      title="Build capacity across sectors"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        <p className="text-body-sm text-muted">
          Order new capacity in many sectors at once. Each sector is priced and built exactly as its
          own Build button would, one after another, until the cash runs out. Up to{" "}
          {BULK_BUILD_MAX_SECTORS} sectors per order.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-body-sm font-medium text-muted">
            Country
            <select
              aria-label="Country"
              value={country}
              disabled={busy}
              onChange={(e) => {
                setCountry(e.target.value);
                invalidate();
              }}
              className={selectClass}
            >
              <option value={ALL}>All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-body-sm font-medium text-muted">
            Sector type
            <select
              aria-label="Sector type"
              value={sectorType}
              disabled={busy}
              onChange={(e) => {
                setSectorType(e.target.value);
                invalidate();
              }}
              className={selectClass}
            >
              <option value={ALL}>All sector types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-body-sm font-medium text-muted">How much in each sector</legend>
          <label className="flex flex-wrap items-center gap-2 text-body-sm text-foreground">
            <input
              type="radio"
              name="bulk-build-rule"
              checked={ruleKind === "facilities"}
              disabled={busy}
              onChange={() => {
                setRuleKind("facilities");
                invalidate();
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Facilities per sector"
              value={facilities}
              disabled={busy}
              onFocus={() => setRuleKind("facilities")}
              onChange={(e) => {
                setFacilities(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                setRuleKind("facilities");
                invalidate();
              }}
              className="h-9 w-16 rounded-lg border border-card-border bg-background px-2 text-center tabular-nums"
            />
            facilities per sector (1 is what each Build button starts at)
          </label>
          <label className="flex flex-wrap items-center gap-2 text-body-sm text-foreground">
            <input
              type="radio"
              name="bulk-build-rule"
              checked={ruleKind === "percent"}
              disabled={busy}
              onChange={() => {
                setRuleKind("percent");
                invalidate();
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Percent of current capacity"
              value={percent}
              disabled={busy}
              onFocus={() => setRuleKind("percent")}
              onChange={(e) => {
                setPercent(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                setRuleKind("percent");
                invalidate();
              }}
              className="h-9 w-16 rounded-lg border border-card-border bg-background px-2 text-center tabular-nums"
            />
            % of each sector&apos;s current capacity, rounded up to whole facilities
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void runPreview()}
            disabled={busy || !rule || matched === 0 || tooMany}
            isLoading={busy && !confirming}
          >
            Preview {matched} sector{matched === 1 ? "" : "s"}
          </Button>
          {tooMany && (
            <p className="text-body-xs text-warning">
              {matched} sectors match. Narrow the selection to {BULK_BUILD_MAX_SECTORS} or fewer.
            </p>
          )}
          {!rule && (
            <p className="text-body-xs text-warning">
              {ruleKind === "facilities"
                ? `Enter 1 to ${BULK_BUILD_MAX_FACILITIES} facilities.`
                : "Enter 1 to 100 percent."}
            </p>
          )}
        </div>

        {shown && shown.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-card-border">
            <table className="w-full min-w-[560px] border-collapse text-body-sm">
              <thead className="bg-card-muted/60 text-body-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Sector</th>
                  <th className="px-3 py-2 text-right font-medium">Capacity now</th>
                  <th className="px-3 py-2 text-right font-medium">Build</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((row) => (
                  <tr key={row.sectorId} className="border-t border-card-border">
                    <td className="px-3 py-2 text-foreground">
                      <span className="font-medium">
                        {stateNames.get(row.sectorId) ?? row.stateId}
                      </span>{" "}
                      <span className="text-muted">{typeLabel(row.sectorType)}</span>
                      {row.understaffed && (row.status === "ready" || row.status === "built") && (
                        <span
                          className="ml-1.5 inline-flex items-center gap-0.5 text-body-xs text-warning"
                          title="This sector already cannot fill all its jobs. New jobs may stay vacant unless you raise pay or the local workforce grows."
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          short of workers
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {formatUnits(row.capacityUnits)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      +{formatUnits(row.units)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {row.costLocal > 0 ? fmt(row.costLocal) : "n/a"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${STATUS_TONE[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.reason && (
                        <span className="block text-body-xs text-muted">{row.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview && !result && (
          <div className="rounded-lg border border-card-border bg-card-muted/60 p-4 text-body-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-foreground">
                {readyCount} of {preview.rows.length} sectors can be built
              </p>
              <p className="text-heading font-bold tabular-nums text-foreground">
                {fmt(readyCost)}
              </p>
            </div>
            <p className="mt-1 text-muted">
              Cash {fmt(cash)}, leaving {fmt(preview.cashAfterLocal ?? cash - readyCost)}.
            </p>
            <p className="mt-2 text-body-xs text-muted">
              Building several sectors of one industry can raise the price of later ones a little,
              because your share of world demand grows with each order. You are never charged more
              than the total you confirm: any sector that would go past it is skipped.
            </p>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-body-sm">
            <p className="font-semibold text-foreground">
              Built {result.builtCount ?? 0} of {result.rows.length} sectors for{" "}
              {fmt(result.spentLocal ?? 0)}.
            </p>
            {result.cashAfterLocal != null && (
              <p className="mt-1 text-muted">Cash left: {fmt(result.cashAfterLocal)}.</p>
            )}
          </div>
        )}

        {confirming && preview && (
          <div
            className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-body-sm"
            role="alertdialog"
            aria-label="Confirm bulk build"
          >
            <p className="font-semibold text-foreground">
              Spend up to {fmt(readyCost)} building in {readyCount} sector
              {readyCount === 1 ? "" : "s"}?
            </p>
            <p className="mt-1 text-muted">
              The money leaves your cash now and the capacity comes online over the next few turns.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-card-border bg-card px-5 py-4">
        <div>
          <p className="text-body-xs text-muted">{result ? "Spent" : "Build total"}</p>
          <p className="text-body font-bold tabular-nums text-foreground">
            {fmt(result ? (result.spentLocal ?? 0) : readyCost)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={confirming ? () => setConfirming(false) : close}
            disabled={busy}
          >
            {result ? "Close" : confirming ? "Back" : "Cancel"}
          </Button>
          {!result &&
            (confirming ? (
              <Button
                variant="primary"
                onClick={() => void runApply()}
                disabled={busy}
                isLoading={busy}
              >
                Confirm {fmt(readyCost)}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setConfirming(true)}
                disabled={busy || !preview || readyCount === 0}
              >
                Build {readyCount} sector{readyCount === 1 ? "" : "s"}
              </Button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

function typeLabel(type: string): string {
  return OPERATING_SECTOR_TYPE_LABELS[type as OperatingSectorType] ?? type;
}

/** A whole number in [min, max] from a text field, or null. */
function wholeIn(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}
