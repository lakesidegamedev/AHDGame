"use client";

import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { readableInk } from "@/lib/elections/marginTierShade";
import type { SeatCycle } from "@/lib/campaignManager/rules";
import { EYEBROW } from "../ui";

const ROW = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "56px minmax(0,1fr) auto",
  gap: 10,
  alignItems: "center",
  minHeight: 36,
  padding: "4px 10px",
  borderRadius: 8,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: FONT.sans,
  fontSize: 13,
  color: BLEND.ink,
} as const;

function MarginChip({ abbr, color, margin }: { abbr: string; color: string; margin: number }) {
  const t = useTranslations("elections.campaignManager.history");
  return (
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: 11.5,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 5,
        background: color,
        color: readableInk(color),
        whiteSpace: "nowrap",
      }}
    >
      {t("margin", { abbr, margin: margin.toFixed(1) })}
    </span>
  );
}

/**
 * Every cycle of the seat, newest first: year, state, winner and margin, with
 * each cycle's finished primaries beneath it. The open cycle is marked; any
 * row opens that cycle (a primary row, that party's primary).
 */
export function PastRaces({
  cycles,
  currentId,
  onOpen,
  canOpen = () => true,
}: {
  cycles: SeatCycle[];
  currentId: string | null;
  onOpen: (c: SeatCycle, partyId?: string) => void;
  /** False for a cycle the page cannot show yet; it is listed but not clickable. */
  canOpen?: (c: SeatCycle) => boolean;
}) {
  const t = useTranslations("elections.campaignManager.history");
  const others = cycles.filter((c) => c.electionId !== currentId);
  const yearOf = (c: SeatCycle) => (c.year != null ? String(c.year) : t("cycle", { n: c.cycle }));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ ...EYEBROW, margin: 0 }}>{t("title")}</h3>
      {others.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("empty")}</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {cycles.map((c) => {
            const open = c.electionId === currentId;
            const openable = canOpen(c);
            return (
              <li key={c.electionId}>
                <button
                  type="button"
                  aria-current={open ? "true" : undefined}
                  disabled={!openable}
                  onClick={() => onOpen(c)}
                  style={{
                    ...ROW,
                    cursor: openable ? "pointer" : "default",
                    background: open ? BLEND.trackAlt : "transparent",
                    border: `1px solid ${open ? BLEND.accent : "transparent"}`,
                  }}
                >
                  <span style={{ fontFamily: FONT.mono, fontSize: 12.5 }}>{yearOf(c)}</span>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.state !== "final" ? (
                      <span
                        style={{
                          color: c.state === "live" ? BLEND.accentInk : BLEND.muted,
                          fontWeight: 600,
                        }}
                      >
                        {t(c.state)}
                      </span>
                    ) : c.seatSplit ? (
                      t("seatLead", {
                        abbr: c.seatSplit.parties[0].partyAbbr,
                        seats: c.seatSplit.parties[0].seats,
                        total: c.seatSplit.total,
                      })
                    ) : c.winner ? (
                      t("winner", { name: c.winner.name, abbr: c.winner.partyAbbr })
                    ) : (
                      <span style={{ color: BLEND.muted }}>{t("noResult")}</span>
                    )}
                  </span>
                  {c.winner && c.margin != null ? (
                    <MarginChip
                      abbr={c.winner.partyAbbr}
                      color={c.winner.partyColor}
                      margin={c.margin}
                    />
                  ) : (
                    <span />
                  )}
                </button>
                {c.primaries.length > 0 ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: "0 0 0 56px" }}>
                    {c.primaries.map((p) => (
                      <li key={p.partyId}>
                        <button
                          type="button"
                          onClick={() => onOpen(c, p.partyId)}
                          style={{
                            ...ROW,
                            gridTemplateColumns: "minmax(0,1fr) auto",
                            minHeight: 30,
                            fontSize: 12.5,
                            background: "transparent",
                            border: "1px solid transparent",
                            color: BLEND.muted,
                          }}
                        >
                          <span>
                            {t("primary", { abbr: p.partyAbbr || p.partyId })} ·{" "}
                            {t("primaryWinner", { name: p.winnerName })}
                          </span>
                          {p.margin != null ? (
                            <MarginChip abbr={p.partyAbbr} color={p.partyColor} margin={p.margin} />
                          ) : (
                            <span />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
