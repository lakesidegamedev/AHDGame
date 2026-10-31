/**
 * Registry for custom wiki markdown components.
 * Add new components here to keep MarkdownContent decoupled and scalable.
 *
 * Widgets may accept an optional `data` prop — the trimmed body of the code
 * fence. Parameterless widgets ignore it; parameterised widgets (e.g.
 * commodity-distribution) parse it to pick which commodity to render.
 *
 * The three data-heavy widgets load on demand. They are the only entries that
 * pull seed and constant tables (the starting-state dashboard alone reaches the
 * historical seat table, the commodity catalogue and the sector strategies;
 * the cabinet guide reaches every country's cabinet mechanics), and a page only
 * renders one when its own markdown asks for it. They used to be imported
 * eagerly, which put all of that in every wiki page's chunk.
 */
import { createElement, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { TurnProcessingFlowchart } from "@/components/wiki/TurnProcessingFlowchart";
import { FavorabilityDecayDiagram } from "@/components/wiki/FavorabilityDecayDiagram";
import { SenateClassesDiagram } from "@/components/wiki/SenateClassesDiagram";
import { ClearingPostureDiagram } from "@/components/wiki/ClearingPostureDiagram";
import { CapitalLoopDiagram } from "@/components/wiki/CapitalLoopDiagram";
import { CongressSnapshot } from "@/components/wiki/widgets/CongressSnapshot";
import { CommodityDistribution } from "@/components/wiki/widgets/CommodityDistribution";
import { CountryHistory } from "@/components/wiki/widgets/CountryHistory";
import { VoteShareCalculator } from "@/components/wiki/calculators/VoteShareCalculator";
import { WikiGuideScreenshot } from "@/components/wiki/WikiGuideScreenshot";

export interface WikiWidgetProps {
  data?: string;
}

/** Inline placeholder for a widget chunk: same footprint family as the panels. */
const WidgetFallback = () =>
  createElement("div", {
    className: "my-6 h-64 w-full animate-pulse rounded-xl border border-card-border bg-card",
  });

const SectorSeedMap = dynamic(
  () =>
    import("@/components/wiki/widgets/SectorSeedMap").then((m) => ({ default: m.SectorSeedMap })),
  { loading: WidgetFallback }
);
const StartingStateDashboard = dynamic(
  () =>
    import("@/components/wiki/widgets/StartingStateDashboard").then((m) => ({
      default: m.StartingStateDashboard,
    })),
  { loading: WidgetFallback }
);
const CabinetGuide = dynamic(
  () => import("@/components/wiki/widgets/CabinetGuide").then((m) => ({ default: m.CabinetGuide })),
  { loading: WidgetFallback }
);

/** Charts pull in the game constants they plot, so the widget loads on demand. */
const WikiChart = dynamic(
  () => import("@/components/wiki/widgets/WikiChart").then((m) => ({ default: m.WikiChart })),
  { loading: WidgetFallback }
);

const WIKI_COMPONENT_REGISTRY: Record<string, ComponentType<WikiWidgetProps>> = {
  "flowchart-turn": TurnProcessingFlowchart,
  "favorability-decay": FavorabilityDecayDiagram,
  "senate-classes": SenateClassesDiagram,
  "clearing-posture": ClearingPostureDiagram,
  "capital-loop": CapitalLoopDiagram,
  "congress-snapshot": CongressSnapshot,
  "commodity-distribution": CommodityDistribution,
  "country-history": CountryHistory,
  "vote-share-calculator": VoteShareCalculator,
  "sector-seed-map": SectorSeedMap,
  "starting-state-dashboard": StartingStateDashboard,
  "cabinet-guide": CabinetGuide,
  "guide-screenshot": WikiGuideScreenshot,
  "wiki-chart": WikiChart,
};

export function getWikiComponent(lang: string): ComponentType<WikiWidgetProps> | null {
  return WIKI_COMPONENT_REGISTRY[lang] ?? null;
}
