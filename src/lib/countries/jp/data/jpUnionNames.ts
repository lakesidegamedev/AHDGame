import type { OperatingSectorType } from "@/lib/constants/corporations";
import { uniform } from "@/lib/seeds/reference/uniformUnionName";

/**
 * Japan's sector-to-union names, by era.
 *
 * ERA MAPS ARE CUMULATIVE ONLY DOWNWARD FROM MODERN. `NAMES_2007` is
 * `{ ...NAMES_MODERN, JP: ... }`, so naming JP replaces the whole modern JP
 * map rather than merging. That is why 2007 and 1999 respread the map they
 * descend from; dropping the spread silently drops unstated sector unions.
 *
 * 1991, 1979 and 1953 do NOT respread: each is a distinct labour settlement
 * (Rengo founded 1989; 1953 is the Sohyo era), so they are authored whole.
 * Omitted sectors fall back to `genericUnionName` at lookup.
 */

export const JP_UNION_NAMES_MODERN: Partial<Record<OperatingSectorType, string>> = {
  manufacturing: "Japanese Trade Union Confederation",
  manufacturing_vehicles: "Confederation of Japan Automobile Workers' Unions",
  chemical_industries: "UA Zensen",
  construction: "National Federation of Construction Workers' Unions",
  energy: "Japanese Federation of Electric Wire and Electric Power Workers' Unions",
  extraction: "Japan Mining Industry Workers' Union",
  healthcare: "Japan Federation of Medical Workers' Unions",
  retail: "UA Zensen",
  media: "UA Zensen",
  logistics: "All Japan Seamen's Union",
  technology: "UA Zensen",
  financial: "National Federation of Finance Industry Workers' Unions",
  telecommunications: "UA Zensen",
  media_entertainment: "UA Zensen",
  defense: "Japan Federation of Aviation Industry Workers' Unions",
  agriculture: "UA Zensen",
  real_estate: "UA Zensen",
};

export const JP_UNION_NAMES_2007: Partial<Record<OperatingSectorType, string>> = {
  ...JP_UNION_NAMES_MODERN,
  chemical_industries: "UI Zensen",
  retail: "UI Zensen",
  media: "UI Zensen",
  technology: "UI Zensen",
  telecommunications: "UI Zensen",
  media_entertainment: "UI Zensen",
  agriculture: "UI Zensen",
  real_estate: "UI Zensen",
};

export const JP_UNION_NAMES_1999: Partial<Record<OperatingSectorType, string>> = {
  ...JP_UNION_NAMES_2007,
  chemical_industries: "Zensen Dōmei",
  retail: "Zensen Dōmei",
  media: "Zensen Dōmei",
  technology: "Zensen Dōmei",
  telecommunications: "Zensen Dōmei",
  media_entertainment: "Zensen Dōmei",
  agriculture: "Zensen Dōmei",
  real_estate: "Zensen Dōmei",
};

export const JP_UNION_NAMES_1991: Partial<Record<OperatingSectorType, string>> = {
  manufacturing: "Japanese Trade Union Confederation",
  manufacturing_vehicles: "Confederation of Japan Automobile Workers' Unions",
  chemical_industries: "Japanese Federation of Synthetic Chemistry Workers' Unions",
  construction: "National Federation of Construction Workers' Unions",
  // Attribution to a single-era energy federation is uncertain; this is the
  // long-standing electric power workers' federation label.
  energy: "Japanese Federation of Electric Wire and Electric Power Workers' Unions",
  extraction: "Japan Coal Miners' Union",
  healthcare: "Japan Federation of Medical Workers' Unions",
  retail: "Zensen Dōmei",
  media: "Japan Federation of Publishing Workers' Unions",
  logistics: "All Japan Seamen's Union",
  technology: "Japanese Federation of Electrical Machine Workers' Unions",
  financial: "National Federation of Finance Industry Workers' Unions",
  telecommunications: "Japan Telecommunications Workers' Union",
};

export const JP_UNION_NAMES_1979: Partial<Record<OperatingSectorType, string>> = {
  manufacturing: "General Council of Trade Unions of Japan",
  manufacturing_vehicles: "Confederation of Japan Automobile Workers' Unions",
  chemical_industries: "Japanese Federation of Synthetic Chemistry Workers' Unions",
  construction: "National Federation of Construction Workers' Unions",
  energy: "Japanese Federation of Electric Wire and Electric Power Workers' Unions",
  extraction: "Japan Coal Miners' Union",
  healthcare: "Japan Federation of Medical Workers' Unions",
  retail: "Zensen Dōmei",
  media: "Japan Federation of Publishing Workers' Unions",
  logistics: "All Japan Seamen's Union",
  technology: "Japanese Federation of Electrical Machine Workers' Unions",
  financial: "National Federation of Finance Industry Workers' Unions",
  telecommunications: "Japan Telecommunications Workers' Union",
};

export const JP_UNION_NAMES_1953: Partial<Record<OperatingSectorType, string>> = {
  ...uniform("General Council of Trade Unions of Japan"),
  manufacturing_vehicles: "All Japan Automobile Industry Workers' Union",
  telecommunications: "Japan Telecommunications Workers' Union",
  logistics: "All Japan Seamen's Union",
  extraction: "Japan Coal Miners' Union",
};
