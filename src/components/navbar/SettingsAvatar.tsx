"use client";

/**
 * Round initial badge used by the settings trigger and the signed-in header
 * inside its panel. Shared so the panel chunk does not have to import the
 * trigger module.
 */
export function AvatarInitial({
  name,
  size = "md",
  highlighted = false,
}: {
  name: string;
  size?: "sm" | "md";
  highlighted?: boolean;
}) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const dims = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";
  return (
    <span
      aria-hidden="true"
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full font-semibold text-primary ring-1 transition-colors ${
        highlighted ? "bg-primary/25 ring-primary/50" : "bg-primary/15 ring-primary/30"
      }`}
    >
      {initial}
    </span>
  );
}
