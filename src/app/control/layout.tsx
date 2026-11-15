import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { ControlShell } from "@/components/control/ControlShell";
import { resolveViewAs, VIEW_AS_COOKIE } from "@/lib/staff/viewAs";

export const metadata = { title: "Control panel", robots: { index: false, follow: false } };

export default async function ControlLayout({ children }: { children: ReactNode }) {
  const staff = await getAuthStaff();
  if (!staff) redirect("/dashboard");
  const requested = (await cookies()).get(VIEW_AS_COOKIE)?.value;

  return (
    <ControlShell
      role={resolveViewAs(staff.staffRole, requested)}
      realRole={staff.staffRole}
      username={staff.username}
    >
      {children}
    </ControlShell>
  );
}
