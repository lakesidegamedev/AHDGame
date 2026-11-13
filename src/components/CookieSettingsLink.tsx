"use client";

import type { CSSProperties } from "react";
import { openCookiePreferences } from "@/components/CookieConsent";

export function CookieSettingsLink(props: {
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const label = props.label ?? "Privacy & cookie settings";

  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className={props.className}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        ...props.style,
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}
