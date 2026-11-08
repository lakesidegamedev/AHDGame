import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { MailReportViewClient } from "@/components/moderator/MailReportViewClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MailReportPage({ params }: Props) {
  const staff = await getAuthStaff();
  if (!staff) notFound();
  const { id } = await params;

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-heading-sm font-semibold text-foreground">Reported conversation</h1>
      <Suspense
        fallback={<p className="py-12 text-center text-sm text-muted">Loading conversation…</p>}
      >
        <MailReportViewClient reportId={id} />
      </Suspense>
    </section>
  );
}
