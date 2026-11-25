"use client";

import { MARKET_POLLING_TEARDOWN } from "@/lib/observability/sentryFilters";
import { useEffect, useMemo, useRef, useState } from "react";
import { marketTurnLabel } from "@/lib/stockExchange/rules/calendar";
import { supportsLogarithmicScale } from "@/lib/stockExchange/rules/candles";
import type { GameDateAnchor } from "@/lib/utils/gameDate";
import { LocalTime, RelativeTime } from "@/components/time/LocalTime";
import { Skeleton } from "@/components/ui";
import { useGameEvents, type GameEvent } from "@/hooks/useGameEvents";
import {
  ALL_EXCHANGES,
  getExchangeApiKey,
  getExchangeLabel,
} from "@/lib/constants/exchangeRegistry";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  OPERATING_SECTOR_TYPES,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { ExchangeFilter } from "../types";
import type { ExchangeMetaEntry } from "../stockMarketRouting";
import type {
  CandlestickData,
  WhitespaceData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { formatPercentDelta } from "@/lib/ui/numbers";
import { toneForDelta, toneText } from "@/lib/ui/tone";

/* ------------------------------------------------------------------ */
/* Range model: turns on the wire, labels in the UI.                   */
/* ------------------------------------------------------------------ */

const MARKET_TICK_EVENTS: GameEvent["type"][] = ["market_tick"];

/**
 * Viewer-local clock time of a 15-minute candle (unix seconds). Chart labels
 * are drawn on the client only, so the browser's own zone is the right one.
 */
function quarterClock(time: number): string {
  return new Date(time * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

const RANGES = [
  { key: "1M", label: "1M", turns: 4 },
  { key: "6M", label: "6M", turns: 24 },
  { key: "1Y", label: "1Y", turns: 48 },
  { key: "5Y", label: "5Y", turns: 240 },
  { key: "10Y", label: "10Y", turns: 480 },
  { key: "ALL", label: "ALL", turns: 0 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface CandleDto {
  turn: number;
  endTurn?: number;
  invalidVolumeTrades?: number;
  notes?: string[];
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  intraday: boolean;
  intradayTurns?: number;
  totalTurns?: number;
}

/** Gain colour when the range closed above where it opened, loss colour when below, else neutral. */
export function rangeTagColor(
  candles: readonly { open: number; close: number }[],
  up: string,
  down: string
): string {
  const first = candles.find((c) => Number.isFinite(c.open));
  const last = [...candles].reverse().find((c) => Number.isFinite(c.close));
  if (!first || !last || last.close === first.open) return "";
  return last.close > first.open ? up : down;
}

function hasFinitePrices(candle: CandleDto): boolean {
  return [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite);
}

function chartCandles(points: CandleDto[]): CandleDto[] {
  // The chart requires unique, increasing timestamps across fallback and quarter candles.
  const byTime = new Map<number, CandleDto>();
  for (const point of points) {
    const existing = byTime.get(point.time);
    if (
      Number.isFinite(point.time) &&
      (!existing || hasFinitePrices(point) || !hasFinitePrices(existing))
    ) {
      byTime.set(point.time, point);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

interface CandlesResponse {
  exchange: string;
  turns: number;
  bucketed: boolean;
  bucketTurns: number;
  /** "15m": one candle per quarter-hour market tick where recorded. */
  resolution?: "15m" | "turn";
  points: CandleDto[];
  intradayTurns: number;
  totalTurns: number;
  /** Turns in the requested window, whether or not each has a recorded close. */
  windowTurns?: number;
  firstIntradayTurn: number | null;
  calendar?: GameDateAnchor | null;
  asOf?: string | null;
  invalidVolumeTrades?: number;
  missingTurns?: number;
  invalidPriceTurns?: number;
}

type CompareKey = { kind: "venue"; api: string } | { kind: "sector"; sector: OperatingSectorType };

function canvasColor(color: string): string {
  const match = color.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i
  );
  if (!match) return color;
  const channels = match.slice(1, 4).map((channel) => Math.round(Number(channel) * 255));
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;

  // lightweight-charts parses canvas colors itself and does not understand
  // CSS expressions such as color-mix(), even when the browser does.
  const probe = document.createElement("span");
  probe.style.color = v;
  if (!probe.style.color) return fallback;
  document.documentElement.appendChild(probe);
  try {
    return canvasColor(getComputedStyle(probe).color.trim()) || fallback;
  } finally {
    probe.remove();
  }
}

function ma(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    return sum / window;
  });
}

export function MarketOverview({
  exchangeFilter,
  exchangeMeta,
  refreshKey,
  currentTurn,
}: {
  exchangeFilter: ExchangeFilter;
  exchangeMeta?: Record<string, ExchangeMetaEntry>;
  refreshKey?: object | null;
  currentTurn?: number;
}) {
  const { formatAmount } = useCurrency();
  const formatAmountRef = useRef(formatAmount);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const compareRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [range, setRange] = useState<RangeKey>("1Y");
  const [showMa20, setShowMa20] = useState(false);
  const [showMa50, setShowMa50] = useState(false);
  const [compare, setCompare] = useState<CompareKey | null>(null);
  const [compareError, setCompareError] = useState(false);
  const [compareCoverage, setCompareCoverage] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDto[]>([]);
  const [bucketTurns, setBucketTurns] = useState(1);
  const bucketed = bucketTurns > 1;
  const [totalTurns, setTotalTurns] = useState(0);
  const [firstIntradayTurn, setFirstIntradayTurn] = useState<number | null>(null);
  const [logScale, setLogScale] = useState(false);
  const canUseLogScale = supportsLogarithmicScale(candles);
  const effectiveLogScale = logScale && canUseLogScale;
  const [intradayTurns, setIntradayTurns] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [meta, setMeta] = useState<CandlesResponse | null>(null);
  const calendarRef = useRef<GameDateAnchor | null>(null);
  const quarterRef = useRef(false);
  // Each quarter-hour market tick redraws the chart without a reload.
  const [tickKey, setTickKey] = useState(0);
  useGameEvents(() => setTickKey((k) => k + 1), MARKET_TICK_EVENTS);
  const fittedRange = useRef<string | null>(null);

  const exchangeApi =
    exchangeFilter === "global" ? "global" : (getExchangeApiKey(exchangeFilter) ?? "global");
  const exchangeLabel = exchangeFilter === "global" ? "Global" : getExchangeLabel(exchangeFilter);

  const turns = RANGES.find((r) => r.key === range)?.turns ?? 48;
  const candlesRef = useRef<CandleDto[]>([]);

  const fmt = (n: number | undefined): string =>
    n === undefined || !Number.isFinite(n) ? "Unavailable" : formatAmountRef.current(Math.round(n));

  useEffect(() => {
    formatAmountRef.current = formatAmount;
    chartRef.current?.applyOptions({
      localization: { priceFormatter: (value: number) => formatAmount(Math.round(value)) },
    });
  }, [formatAmount, chartReady]);

  useEffect(() => {
    if (!canUseLogScale) setLogScale(false);
  }, [canUseLogScale]);

  /* ---------------- chart lifecycle (mount once) ---------------- */
  useEffect(() => {
    let disposed = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;
    (async () => {
      const container = containerRef.current;
      // The container renders unconditionally (fixed heights with overlays),
      // so it is present on mount. A missing container means a render
      // contract break: fail visibly instead of a permanently blank chart.
      if (!container) {
        setFailed(true);
        return;
      }
      const {
        createChart,
        CandlestickSeries,
        HistogramSeries,
        CrosshairMode,
        createSeriesMarkers,
      } = await import("lightweight-charts");
      if (disposed) return;

      const up = cssVar("--success", "#22c55e");
      const down = cssVar("--error", "#ef4444");
      const muted = cssVar("--muted", "#8f8f9d");
      const border = cssVar("--card-border", "#2a2a3d");
      const gameDate = (time: number): string => {
        const candle = candlesRef.current.find((row) => row.time === time);
        if (!candle) return "";
        return marketTurnLabel(candle.endTurn ?? candle.turn, calendarRef.current);
      };
      const turnLabel = (time: number): string => {
        const label = gameDate(time);
        return label && quarterRef.current ? `${label} ${quarterClock(time)}` : label;
      };

      chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { color: "transparent" },
          textColor: muted,
          fontFamily: "inherit",
          fontSize: 12,
        },
        grid: { vertLines: { color: border }, horzLines: { color: border } },
        localization: { timeFormatter: (time: Time) => turnLabel(Number(time)) },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: muted, style: 2, labelBackgroundColor: muted },
          horzLine: { color: muted, style: 2, labelBackgroundColor: muted },
        },
        rightPriceScale: { borderColor: border, scaleMargins: { top: 0.08, bottom: 0.25 } },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
          // The axis is in game time, like the rest of the game. A 15-minute
          // candle's real clock time is still in the crosshair label.
          tickMarkFormatter: (time: Time) => gameDate(Number(time)),
        },
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        wickUpColor: up,
        wickDownColor: down,
        borderVisible: false,
        priceFormat: { type: "custom", formatter: (price: number) => fmt(price), minMove: 0.01 },
      });
      candleRef.current = candleSeries;
      markerRef.current = createSeriesMarkers(candleSeries, []);

      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: "",
          priceFormat: { type: "volume" },
          lastValueVisible: false,
          priceLineVisible: false,
        },
        0
      );
      volumeRef.current = volumeSeries;
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      setChartReady(true);

      chart.subscribeCrosshairMove((param) => {
        const tip = tooltipRef.current;
        if (!tip || !param.point || !param.time) {
          if (tip) tip.style.display = "none";
          return;
        }
        const data = param.seriesData.get(candleSeries) as CandlestickData | undefined;
        if (!data || data.open === undefined) {
          tip.style.display = "none";
          return;
        }
        const rows = candlesRef.current;
        const idx = rows.findIndex((c) => c.time === (param.time as number));
        const chg = data.close - data.open;
        const chgPct = data.open !== 0 ? (chg / data.open) * 100 : 0;
        const vol = idx >= 0 ? rows[idx].volume : 0;
        const row = rows[idx];
        const flatNote = !row?.intraday
          ? " · recorded closes"
          : ` · ${row.intradayTurns ?? 1}/${row.totalTurns ?? 1} turns with prints`;
        tip.innerHTML =
          `<div class="font-mono font-bold text-foreground">${row ? marketTurnLabel(row.turn, calendarRef.current, true) : ""}${row && quarterRef.current ? ` ${quarterClock(row.time)}` : ""}${row?.endTurn && row.endTurn !== row.turn ? `<br/>through ${marketTurnLabel(row.endTurn, calendarRef.current, true)}` : ""}</div>` +
          `<div class="font-mono tabular-nums">O ${fmt(data.open)} H ${fmt(data.high)}<br/>` +
          `L ${fmt(data.low)} C ${fmt(data.close)}</div>` +
          `<div class="font-mono tabular-nums ${chg >= 0 ? "text-success" : "text-error"}">` +
          `${chg >= 0 ? "+" : ""}${fmt(chg)} (${chg >= 0 ? "+" : ""}${chgPct.toFixed(2)}%)</div>` +
          `<div class="font-mono tabular-nums text-muted">Vol ${fmt(vol)}${flatNote}${row?.invalidVolumeTrades ? " · incomplete turnover" : ""}</div>`;
        const box = container.getBoundingClientRect();
        tip.style.display = "block";
        tip.style.width = "max-content";
        tip.style.maxWidth = `${Math.max(box.width - 16, 0)}px`;
        tip.style.left = `${Math.min(Math.max(param.point.x + 12, 8), Math.max(box.width - tip.offsetWidth - 8, 8))}px`;
        tip.style.top = `${Math.min(Math.max(param.point.y - 10, 8), Math.max(box.height - tip.offsetHeight - 8, 8))}px`;
      });

      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          if (!container || !chart) return;
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        });
        observer.observe(container);
      }
    })().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      markerRef.current?.detach();
      markerRef.current = null;
      chart?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      ma20Ref.current = null;
      ma50Ref.current = null;
      compareRef.current = null;
    };
  }, []);

  /* ---------------- data: candles + volume per range ---------------- */
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/stock-exchange/candles?exchange=${exchangeApi}&turns=${turns}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error("Market data unavailable");
        const json: CandlesResponse = await response.json();
        if (controller.signal.aborted) return;
        calendarRef.current = json.calendar ?? null;
        quarterRef.current = json.resolution === "15m";
        setMeta(json);
        setCandles(chartCandles(json.points ?? []));
        setBucketTurns(json.bucketTurns ?? 1);
        setTotalTurns(json.totalTurns ?? json.points.length);
        setFirstIntradayTurn(
          json.firstIntradayTurn ?? json.points.find((c) => c.intraday)?.turn ?? null
        );
        setIntradayTurns(json.intradayTurns ?? 0);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- request status follows range changes
    setLoading(true);
    void load();
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort(new DOMException(MARKET_POLLING_TEARDOWN, "AbortError"));
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [exchangeApi, turns, refreshKey, currentTurn, tickKey]);

  /* ---------------- push candles + volume into the chart ---------------- */
  useEffect(() => {
    candlesRef.current = candles;
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;
    const up = cssVar("--success", "#22c55e");
    const down = cssVar("--error", "#ef4444");
    // lightweight-charts throws "Value is null" on a null or NaN price, which
    // takes the whole market page down. A candle with no usable price (a turn
    // the exchange did not trade) renders as a gap instead.
    candleSeries.setData(
      candles.map((c): CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp> =>
        hasFinitePrices(c)
          ? {
              time: c.time as UTCTimestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }
          : { time: c.time as UTCTimestamp }
      )
    );
    volumeSeries.setData(
      candles.map((c): HistogramData<UTCTimestamp> => ({
        time: c.time as UTCTimestamp,
        value: Number.isFinite(c.volume) ? c.volume : 0,
        color: c.close >= c.open ? `${up}80` : `${down}80`,
      }))
    );
    // The last-value tag takes the colour of the latest candle by default, so a
    // market up over the range shows a red tag after one down turn. Colour it by
    // the range change instead, the same direction the header shows.
    candleSeries.applyOptions({ priceLineColor: rangeTagColor(candles, up, down) });
    const key = `${exchangeApi}:${turns}`;
    const dataKey = `${meta?.exchange ?? exchangeApi}:${meta?.turns ?? turns}`;
    if (dataKey === key && fittedRange.current !== key && candles.length > 0) {
      chart.timeScale().fitContent();
      fittedRange.current = key;
    }
  }, [candles, chartReady, exchangeApi, turns, meta]);

  useEffect(() => {
    let cancelled = false;
    void import("lightweight-charts").then(({ PriceScaleMode }) => {
      if (!cancelled)
        candleRef.current?.priceScale().applyOptions({
          mode: effectiveLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        });
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveLogScale, chartReady]);

  // Mark the first live-print bucket on the price series as well as in the legend.
  useEffect(() => {
    const events = candles.filter((c) => (c.notes?.length ?? 0) > 0);
    markerRef.current?.setMarkers(
      events.map((c) => ({
        time: c.time as UTCTimestamp,
        position: "aboveBar" as const,
        shape: "circle" as const,
        color: cssVar("--muted", "#8f8f9d"),
        text: c.notes?.some((n) => n.startsWith("Large"))
          ? "Valuation change"
          : c.notes?.some((n) => n.startsWith("Live-print") || n.startsWith("Listing coverage"))
            ? "Coverage change"
            : "",
      }))
    );
  }, [candles, chartReady]);

  /* ---------------- moving-average overlays ---------------- */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    let cancelled = false;
    void import("lightweight-charts").then(({ LineSeries }) => {
      if (cancelled) return;
      const closes = candles.map((c) => c.close);
      const times = candles.map((c) => c.time as UTCTimestamp);
      const sync = (
        ref: React.MutableRefObject<ISeriesApi<"Line"> | null>,
        on: boolean,
        window: number,
        color: string
      ) => {
        if (on && !ref.current) {
          ref.current = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
        } else if (!on && ref.current) {
          chart.removeSeries(ref.current);
          ref.current = null;
        }
        if (on && ref.current) {
          const values = ma(closes, window);
          const data: LineData<UTCTimestamp>[] = [];
          values.forEach((v, i) => {
            if (v !== null && Number.isFinite(v)) data.push({ time: times[i], value: v });
          });
          ref.current.setData(data);
        }
      };
      // Cyan/amber already carry meaning in the UI (commodity chips); reuse
      // them so no new palette enters the theme.
      sync(ma20Ref, showMa20, 20, "#22d3ee");
      sync(ma50Ref, showMa50, 50, "#f59e0b");
    });
    return () => {
      cancelled = true;
    };
  }, [candles, chartReady, showMa20, showMa50]);

  /* ---------------- compare overlay ---------------- */
  const compareLabel = useMemo(() => {
    if (!compare) return null;
    if (compare.kind === "venue") {
      const info = ALL_EXCHANGES.find((e) => e.apiKey === compare.api);
      return info ? `${info.exchangeName} %` : null;
    }
    return `${OPERATING_SECTOR_TYPE_LABELS[compare.sector] ?? compare.sector} %`;
  }, [compare]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    let cancelled = false;
    if (!compare) {
      if (compareRef.current) {
        chart.removeSeries(compareRef.current);
        compareRef.current = null;
      }
      return;
    }
    const base = candles[0].time;
    const applyLine = (data: LineData<UTCTimestamp>[]) => {
      if (!chart) return;
      if (data.length === 0) {
        setCompareError(true);
        compareRef.current?.setData([]);
        return;
      }
      if (!compareRef.current) {
        void import("lightweight-charts").then(({ LineSeries }) => {
          if (cancelled || !chart || compareRef.current) return;
          compareRef.current = chart.addSeries(LineSeries, {
            color: cssVar("--primary", "#4f46e5"),
            lineWidth: 2,
            priceScaleId: "compare",
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
          });
          chart.priceScale("compare").applyOptions({ borderVisible: false });
          compareRef.current.setData(data);
        });
      } else {
        compareRef.current.setData(data);
      }
    };
    const query =
      compare.kind === "venue"
        ? `exchange=${compare.api}`
        : `exchange=global&sector=${compare.sector}`;
    fetch(`/api/stock-exchange/candles?${query}&turns=${turns}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Comparison unavailable"))))
      .then((json: CandlesResponse) => {
        if (cancelled) return;
        setCompareError(false);
        setCompareCoverage(
          `${json.intradayTurns ?? 0}/${json.totalTurns ?? json.points.length} turns with live prints; older comparison levels use recorded closes`
        );
        const points = chartCandles(json.points ?? []).filter((p) => p.time >= base);
        const opening = points[0]?.open;
        applyLine(
          opening > 0
            ? points
                .filter((p) => Number.isFinite(p.close))
                .map((p) => ({
                  time: p.time as UTCTimestamp,
                  value: (p.close / opening - 1) * 100,
                }))
            : []
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCompareError(true);
          compareRef.current?.setData([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [candles, chartReady, compare, exchangeApi, turns]);

  const hasPlottable = candles.some((c) => hasFinitePrices(c) && c.high > 0);
  const noChart = failed || !hasPlottable;
  const last = candles[candles.length - 1];
  const first = candles[0];
  const rangeChg = last && first ? last.close - first.open : 0;
  const rangeChgPct = first?.open ? (rangeChg / first.open) * 100 : 0;

  const venueOptions = useMemo(
    () =>
      [{ apiKey: "global", exchangeName: "Global" }, ...ALL_EXCHANGES].filter(
        (v) =>
          v.apiKey !== exchangeApi &&
          (!exchangeMeta ||
            v.apiKey === "global" ||
            Object.values(exchangeMeta).some((entry) => entry.exchangeApi === v.apiKey))
      ),
    [exchangeApi, exchangeMeta]
  );
  const sectorOptions = useMemo(
    () => (exchangeApi === "global" ? [...OPERATING_SECTOR_TYPES] : []),
    [exchangeApi]
  );

  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-card-border">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-body-lg font-semibold text-muted">
              {exchangeLabel} · listed market cap
            </h3>
            <p className="basis-full text-body-sm text-muted">
              The combined value of the companies listed here, which are the game&apos;s modelled
              corporations. It is not the whole national stock market and is not comparable to GDP.
            </p>
            {/* Holds its line while loading so the chart below does not jump. */}
            <div className="min-h-5 text-body tabular-nums">
              {!loading && last && (
                <>
                  <span className="font-mono font-bold text-foreground">
                    {formatAmount(last.close)}
                  </span>{" "}
                  <span
                    title={`${range} raw capitalization change from first open to last close; includes changes in listings and valuation coverage`}
                    className={`font-mono font-bold ${toneText(toneForDelta(rangeChg))}`}
                  >
                    {rangeChg > 0 ? "+" : ""}
                    {formatAmount(Math.round(rangeChg))} ({formatPercentDelta(rangeChgPct, 2)})
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  setRange(r.key);
                  setLogScale(r.key === "ALL" || r.key === "10Y");
                }}
                title={
                  r.turns === 0
                    ? "Full recorded history"
                    : `Last ${r.turns} turns in the game calendar (48 turns per year)`
                }
                className={`px-2.5 py-1 rounded-md text-body-sm font-medium border transition-colors whitespace-nowrap ${
                  range === r.key
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-card-elevated border-card-border text-muted hover:text-foreground hover:bg-card-elevated/80"
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => canUseLogScale && setLogScale((v) => !v)}
              disabled={!canUseLogScale}
              aria-pressed={effectiveLogScale}
              title="Logarithmic price scale keeps large historical spikes visible"
              className="px-2.5 py-1 rounded-md text-body-sm font-medium border border-card-border text-muted"
            >
              {effectiveLogScale ? "Log scale" : "Linear scale"}
            </button>
            <span className="mx-1 h-4 w-px bg-card-border" />
            <button
              onClick={() => setShowMa20((v) => !v)}
              aria-pressed={showMa20}
              title="20-candle moving average of closes"
              className={`px-2.5 py-1 rounded-md text-body-sm font-medium border transition-colors whitespace-nowrap ${
                showMa20
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-card-elevated border-card-border text-muted hover:text-foreground"
              }`}
            >
              MA-20
            </button>
            <button
              onClick={() => setShowMa50((v) => !v)}
              aria-pressed={showMa50}
              title="50-candle moving average of closes"
              className={`px-2.5 py-1 rounded-md text-body-sm font-medium border transition-colors whitespace-nowrap ${
                showMa50
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-card-elevated border-card-border text-muted hover:text-foreground"
              }`}
            >
              MA-50
            </button>
            <span className="mx-1 h-4 w-px bg-card-border" />
            <select
              aria-label="Compare with another index"
              value={
                compare
                  ? `${compare.kind}:${compare.kind === "venue" ? compare.api : compare.sector}`
                  : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                setCompareError(false);
                setCompareCoverage(null);
                if (!v) {
                  setCompare(null);
                  return;
                }
                const [kind, key] = v.split(":");
                setCompare(
                  kind === "venue"
                    ? { kind: "venue", api: key }
                    : { kind: "sector", sector: key as OperatingSectorType }
                );
              }}
              className="px-2 py-1 rounded-md text-body-sm font-medium border bg-card-elevated border-card-border text-muted hover:text-foreground max-w-44"
            >
              <option value="">Compare…</option>
              <optgroup label="Exchanges">
                {venueOptions.map((v) => (
                  <option key={v.apiKey} value={`venue:${v.apiKey}`}>
                    {v.exchangeName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Sectors">
                {sectorOptions.map((s) => (
                  <option key={s} value={`sector:${s}`}>
                    {OPERATING_SECTOR_TYPE_LABELS[s]}
                  </option>
                ))}
              </optgroup>
            </select>
            {compareLabel && (
              <span className="text-body-sm text-muted">
                vs {compareLabel} · {compareCoverage ?? "loading coverage"} ·{" "}
                <button onClick={() => setCompare(null)} className="text-primary hover:underline">
                  clear
                </button>
              </span>
            )}
            {compareError && (
              <span className="text-body-sm text-error">Comparison series unavailable</span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-success" />
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-error" />
            {bucketed ? "Bucket candles" : "Turn candles"} · volume
          </span>
          {bucketed && (
            <span>
              {bucketTurns / 4 < 12 ? `${bucketTurns / 4}-month` : `${bucketTurns / 48}-year`}{" "}
              buckets ({bucketTurns} turns)
            </span>
          )}
          {!loading && candles.length > 0 && (
            <span>
              {intradayTurns}/{meta?.windowTurns ?? totalTurns} turns with intraday prints
              {intradayTurns === 0 ? " (turn closes only)" : ""}
            </span>
          )}
          {!loading && firstIntradayTurn != null && intradayTurns < totalTurns && (
            <span>
              Live-print coverage begins{" "}
              {marketTurnLabel(firstIntradayTurn, meta?.calendar ?? null, true)}; earlier candles
              use recorded closes
            </span>
          )}
        </div>
        <p className="mb-2 min-h-4 text-body-sm text-muted">
          {last && (
            <>
              Through {marketTurnLabel(last.endTurn ?? last.turn, meta?.calendar ?? null, true)}
              {bucketed && (last.endTurn ?? last.turn) - last.turn + 1 < bucketTurns
                ? " · partial bucket"
                : ""}
              {meta?.asOf && (
                <>
                  {" "}
                  · Observed <RelativeTime value={meta.asOf} /> ({" "}
                  <LocalTime
                    value={meta.asOf}
                    options={{ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }}
                  />
                  ) · refreshes every minute
                </>
              )}
            </>
          )}
        </p>
        <div className="relative h-60 sm:h-80">
          <div ref={containerRef} className={`h-full w-full ${noChart ? "invisible" : ""}`} />
          <div
            ref={tooltipRef}
            style={{ display: "none" }}
            className="pointer-events-none absolute z-10 rounded-lg border border-card-border bg-card-elevated px-2.5 py-1.5 text-body-sm shadow-lg whitespace-normal"
          />
          {loading && candles.length === 0 && (
            <Skeleton className="absolute inset-0 h-full w-full" />
          )}
          {!loading && noChart && (
            <p className="absolute inset-0 flex items-center justify-center bg-card px-4 text-center text-body text-muted">
              {failed
                ? "Market data could not be refreshed. Try again shortly."
                : candles.length === 0
                  ? "No market history available yet for this range."
                  : "No listed company has a market value yet, so there is nothing to chart."}
            </p>
          )}
        </div>
        {/* Below the chart: these arrive with the data and would push it down. */}
        {(meta?.invalidVolumeTrades ?? 0) > 0 && (
          <p className="mt-2 text-body-sm text-warning">
            Turnover incomplete: {meta?.invalidVolumeTrades} invalid trade records excluded.
          </p>
        )}
        {(meta?.missingTurns ?? 0) + (meta?.invalidPriceTurns ?? 0) > 0 && (
          <p className="mt-2 text-body-sm text-warning">
            History coverage: {meta?.missingTurns ?? 0} missing turns;{" "}
            {meta?.invalidPriceTurns ?? 0} invalid valuations excluded.
          </p>
        )}
        {candles.some((c) => c.notes?.length) && (
          <details className="mt-2 text-body-sm text-muted">
            <summary className="cursor-pointer">
              Valuation and coverage events ({candles.filter((c) => c.notes?.length).length})
            </summary>
            <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
              {candles
                .filter((c) => c.notes?.length)
                .map((c) => (
                  <li key={c.turn}>
                    {marketTurnLabel(c.turn, meta?.calendar ?? null, true)}
                    {c.endTurn !== c.turn && c.endTurn
                      ? ` through ${marketTurnLabel(c.endTurn, meta?.calendar ?? null, true)}`
                      : ""}
                    : {c.notes?.join("; ")}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
      <div className="px-4 py-2 text-body-sm text-muted border-t border-card-border mt-3">
        Game-calendar ranges: 4 turns per month, 48 per year. Raw listed capitalization in anchor
        units,{" "}
        {bucketed
          ? `${bucketTurns}-turn buckets`
          : meta?.resolution === "15m"
            ? "one candle per 15-minute market update where recorded, otherwise one per turn"
            : "one candle per turn"}
        . Covered turns use observed live prints; older turns use recorded closes. Capitalization
        changes include listings, removals and coverage changes, so they are not investment returns.
        Volume includes recorded executable fills. Hover for O/H/L/C, turnover and bucket dates.
      </div>
    </div>
  );
}

/** The candle chart under a name that does not clash with the hub overview. */
export { MarketOverview as StockMarketChart };
