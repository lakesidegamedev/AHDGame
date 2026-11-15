import Link from "next/link";
import Image from "next/image";
import { CDN_LOGO_URL } from "@/lib/images/staticCdnAssets";
import { SectionLabel } from "@/components/ui";
import {
  ACCOUNT_URL,
  FREEZE_MESSAGE,
  PASSWORD_EVERYWHERE_NOTE,
  centralActionLabel,
  type AccountFieldKind,
  type AccountFieldsMode,
} from "@/lib/auth/accountFields/rules";

interface NoticeProps {
  kind: AccountFieldKind;
  mode: Exclude<AccountFieldsMode, "off">;
}

/** Plain explanation for a screen whose writes moved to the Lakeside account. */
export function AccountFieldsNotice({ kind, mode }: NoticeProps) {
  if (mode === "freeze") {
    return (
      <p role="status" className="text-body text-foreground">
        {FREEZE_MESSAGE}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-body text-foreground">
        {kind === "email"
          ? "Your email is kept in your Lakeside account, and this game follows it."
          : "Your password is kept in your Lakeside account, and this game follows it."}
      </p>
      {kind !== "email" && <p className="text-body text-muted">{PASSWORD_EVERYWHERE_NOTE}</p>}
      <a
        href={ACCOUNT_URL}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-body font-medium text-white transition-colors hover:bg-primary/90"
      >
        {centralActionLabel(kind)}
      </a>
    </div>
  );
}

/** Full-page version for the public forgot and reset password routes. */
export function AccountFieldsNoticePage({ kind, mode, title }: NoticeProps & { title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="relative mx-auto w-full max-w-md">
        <Link href="/" className="mb-5 flex items-center gap-2.5 sm:mb-7">
          <Image
            src={CDN_LOGO_URL}
            unoptimized
            alt="A House Divided Logo"
            width={36}
            height={36}
            className="object-contain"
          />
          <span className="text-body-lg font-semibold tracking-tight">A House Divided</span>
        </Link>

        <section className="relative overflow-hidden rounded-xl border border-card-border bg-card p-5 shadow-panel sm:p-8">
          <div className="mb-7 border-b border-card-border pb-6">
            <SectionLabel as="p">Account</SectionLabel>
            <h1 className="mt-1 text-display font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <AccountFieldsNotice kind={kind} mode={mode} />
          <p className="mt-8 text-center text-body text-muted">
            <Link
              href="/login"
              className="font-medium text-primary transition-colors hover:text-primary-dark link-underline"
            >
              Back to login
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
