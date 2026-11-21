"use client";

import { useState } from "react";
import { MailComposerModal } from "@/components/MailComposerModal";

export function ProfileMessageButton({
  toCharacterId,
  toCharacterName,
  className,
  label,
}: {
  toCharacterId: string;
  toCharacterName: string;
  className: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <MailComposerModal
          mode={{ type: "mail", toCharacterId, toCharacterName }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
