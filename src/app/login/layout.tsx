import { Suspense } from "react";

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-pulse rounded-full bg-primary/20" aria-hidden />
    </div>
  );
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoginFallback />}>{children}</Suspense>;
}
