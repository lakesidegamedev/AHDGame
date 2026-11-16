"use client";

import { createContext, useContext, type ReactNode } from "react";

const WriterContext = createContext(false);

/** Marks the viewer as someone who can edit this page, so embeds can explain problems to them. */
export function WikiWriterProvider({
  isWriter,
  children,
}: {
  isWriter: boolean;
  children: ReactNode;
}) {
  return <WriterContext.Provider value={isWriter}>{children}</WriterContext.Provider>;
}

export function useIsWikiWriter(): boolean {
  return useContext(WriterContext);
}
