"use client";

import { useEffect } from "react";

const locks = new WeakMap<Document, { count: number; body: string; root: string }>();

/** Nested dialogs retain the page lock until the last dialog closes. */
export function useBodyScrollLock(open = true) {
  useEffect(() => {
    if (!open) return;
    const doc = document;
    let lock = locks.get(doc);
    if (!lock) {
      lock = { count: 0, body: doc.body.style.overflow, root: doc.documentElement.style.overflow };
      locks.set(doc, lock);
      doc.body.style.overflow = "hidden";
      doc.documentElement.style.overflow = "hidden";
    }
    lock.count++;
    return () => {
      if (--lock.count !== 0) return;
      doc.body.style.overflow = lock.body;
      doc.documentElement.style.overflow = lock.root;
      locks.delete(doc);
    };
  }, [open]);
}
