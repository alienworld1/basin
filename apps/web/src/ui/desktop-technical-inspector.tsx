"use client";

import { useRef, useState } from "react";

import { Sheet } from "./sheet";

type DesktopTechnicalInspectorProps = {
  children: React.ReactNode;
};

export function DesktopTechnicalInspector({
  children,
}: DesktopTechnicalInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="focus-ring mt-auto min-h-11 rounded-sm px-3 text-left text-sm font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
      >
        Technical details
      </button>
      <Sheet
        isOpen={isOpen}
        title="Technical details"
        onClose={() => setIsOpen(false)}
        returnFocusRef={triggerRef}
      >
        {children}
      </Sheet>
    </>
  );
}
