"use client";

import { useTranslations } from "next-intl";
import {
  MAX_TRAY_WIDGETS,
  type WidgetLayout,
  type WidgetMenu,
} from "@/lib/sidebarWidgets/widgetCatalog";

export interface WidgetOption {
  key: string;
  label: string;
}

interface WidgetEditorProps {
  layout: WidgetLayout;
  options: WidgetOption[];
  /** Desktop menus this player has; Staff only for staff. */
  menus: WidgetMenu[];
  onChange: (layout: WidgetLayout) => void;
}

export function WidgetEditor({ layout, options, menus, onChange }: WidgetEditorProps) {
  const t = useTranslations("nav.widgets");
  const label = (key: string) => options.find((option) => option.key === key)?.label ?? key;
  const move = (index: number, by: number) => {
    const tray = [...layout.tray];
    const [item] = tray.splice(index, 1);
    tray.splice(index + by, 0, item!);
    onChange({ ...layout, tray });
  };
  const available = options.filter((option) => !layout.tray.includes(option.key));
  const full = layout.tray.length >= MAX_TRAY_WIDGETS;
  const button =
    "rounded px-1.5 py-0.5 text-xs text-muted hover:bg-white/5 hover:text-foreground disabled:opacity-30";

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
          {t("tray.inTray")}
        </h3>
        {layout.tray.length === 0 ? (
          <p className="text-xs text-muted">{t("tray.empty")}</p>
        ) : (
          <ol className="space-y-1">
            {layout.tray.map((key, index) => (
              <li
                key={key}
                className="flex items-center gap-1 rounded-lg border border-card-border bg-background/50 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {label(key)}
                </span>
                <button
                  type="button"
                  className={button}
                  disabled={index === 0}
                  aria-label={`${t("tray.moveUp")}: ${label(key)}`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={index === layout.tray.length - 1}
                  aria-label={`${t("tray.moveDown")}: ${label(key)}`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label={`${t("tray.remove")}: ${label(key)}`}
                  onClick={() =>
                    onChange({ ...layout, tray: layout.tray.filter((item) => item !== key) })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {available.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-2">
            {t("tray.add")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {available.map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={full}
                onClick={() => onChange({ ...layout, tray: [...layout.tray, option.key] })}
                className="rounded-full border border-card-border px-2.5 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
              >
                + {option.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {menus.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-2">
            {t("tray.menus")}
          </h3>
          <p className="mb-2 text-xs text-muted">{t("tray.menusHint")}</p>
          <div className="space-y-1.5">
            {menus.map((menu) => (
              <label key={menu} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{t(`menus.${menu}`)}</span>
                <select
                  value={layout.nav[menu] ?? ""}
                  onChange={(event) => {
                    const nav = { ...layout.nav };
                    if (event.target.value) nav[menu] = event.target.value;
                    else delete nav[menu];
                    onChange({ ...layout, nav });
                  }}
                  className="max-w-[12rem] rounded-md border border-card-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value="">{t("tray.menuNone")}</option>
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
