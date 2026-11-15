"use client";

import { Component, cloneElement, Children, type ErrorInfo, type ReactNode } from "react";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { useReportedError } from "@/lib/errors/useReportedError";

interface NavigationLink {
  href: string;
  label: string;
}

interface PageErrorBoundaryProps {
  children: ReactNode;
  /** Page name for the error log (e.g., "Bill page") */
  pageName: string;
  /** Custom error message shown to users */
  errorMessage?: string;
  /** Navigation links to show in the error UI */
  navigationLinks?: NavigationLink[];
}

interface State {
  error: Error | null;
  componentStack?: string;
  retryKey: number;
}

function BoundaryFallback({
  error,
  pageName,
  errorMessage,
  navigationLinks,
  componentStack,
  onRetry,
}: {
  error: Error;
  pageName: string;
  errorMessage: string;
  navigationLinks: NavigationLink[];
  componentStack?: string;
  onRetry: () => void;
}) {
  const reported = useReportedError(error, {
    logPrefix: `${pageName} error (boundary)`,
    componentStack,
  });
  return (
    <ErrorPanel
      error={error}
      reported={reported}
      onRetry={onRetry}
      description={errorMessage}
      links={navigationLinks}
      fullScreen
    />
  );
}

/**
 * Generic client-side error boundary for wrapping page content.
 * Catches render errors and shows a retry UI with custom navigation links.
 *
 * @example
 * <PageErrorBoundary
 *   pageName="Bill page"
 *   errorMessage="The bill page couldn't load."
 *   navigationLinks={[
 *     { href: "/congress?chamber=senate&tab=bills", label: "Back to Senate Bills" },
 *     { href: "/dashboard", label: "Dashboard" },
 *   ]}
 * >
 *   <BillDetailClient billId={billId} />
 * </PageErrorBoundary>
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, State> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  handleRetry = () => {
    this.setState((s) => ({ error: null, componentStack: undefined, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      // Wait for componentDidCatch so the report carries the component stack.
      if (this.state.componentStack === undefined) return null;
      const {
        errorMessage = "This page couldn't load. This may be a temporary issue.",
        navigationLinks = [{ href: "/dashboard", label: "Dashboard" }],
        pageName,
      } = this.props;

      return (
        <BoundaryFallback
          error={this.state.error}
          pageName={pageName}
          errorMessage={errorMessage}
          navigationLinks={navigationLinks}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
        />
      );
    }
    const child = Children.only(this.props.children);
    return cloneElement(child as React.ReactElement<{ key?: number }>, {
      key: this.state.retryKey,
    });
  }
}
