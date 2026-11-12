import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { ControlShell } from "@/components/control/ControlShell";

export const metadata = { title: "Control panel", robots: { index: false, follow: false } };

export default async function ControlLayout({ children }: { children: ReactNode }) {
  const staff = await getAuthStaff();
  if (!staff) redirect("/dashboard");

  return (
    <ControlShell role={staff.staffRole} username={staff.username}>
      {children}
    </ControlShell>
  );
}
