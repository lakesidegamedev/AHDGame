"use client";

import type { AskDrawerSide } from "@/components/askDrawer/AskDrawerPanel";
import { SideTray } from "./SideTray";
import { useWidgetSetup } from "./useWidgetSetup";

/** The side tray wired to the player's saved widgets. Experimental players only. */
export function ExperimentalSideTray({
  side,
  onSwapSide,
  keirHidden,
}: {
  side: AskDrawerSide;
  onSwapSide: () => void;
  keirHidden: boolean;
}) {
  const widgets = useWidgetSetup();
  return (
    <SideTray
      side={side}
      onSwapSide={onSwapSide}
      keirHidden={keirHidden}
      layout={widgets.layout}
      options={widgets.options}
      menus={widgets.menus}
      resolveKey={widgets.resolveKey}
      initialOpen={widgets.trayOpen}
      onSaveLayout={widgets.saveLayout}
      onSaveOpen={widgets.saveTrayOpen}
    />
  );
}
