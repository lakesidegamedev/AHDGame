"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toolPath, type NavGroup } from "@/lib/staff/panelRegistry";

interface ControlNavProps {
  groups: NavGroup[];
  onNavigate?: () => void;
}

/** Grouped tool list. The caller has already filtered it for the viewer's role. */
export function ControlNav({ groups, onNavigate }: ControlNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Control panel" className="flex flex-col gap-4 px-2 py-3">
      {groups.map(({ area, tools }) => (
        <div key={area.id} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-body-xs font-medium uppercase tracking-wide text-muted">
            {area.label}
          </div>
          {tools.map((tool) => {
            const href = toolPath(tool);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={tool.id}
                href={href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-body-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {tool.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
