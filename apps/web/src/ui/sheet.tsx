"use client";

import { animated, useReducedMotion, useSpring } from "@react-spring/web";
import { useEffect, useRef } from "react";

type SheetProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onClosed?: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
};

export function Sheet({
  isOpen,
  title,
  onClose,
  onClosed,
  returnFocusRef,
  children,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reducedMotion = useReducedMotion();

  const spring = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: isOpen ? "translate3d(0%, 0, 0)" : "translate3d(100%, 0, 0)",
    immediate: Boolean(reducedMotion),
    config: { tension: 280, friction: 34, clamp: true },
    onRest: () => {
      const dialog = dialogRef.current;
      if (!isOpen && dialog?.open) {
        dialog.close();
        const returnTarget = returnFocusRef.current;
        if (returnTarget && returnTarget.getClientRects().length > 0) {
          returnTarget.focus();
        }
        onClosed?.();
      }
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [isOpen]);

  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 768px)");
    const closeAcrossBreakpoint = () => {
      if (isOpen) onClose();
    };

    breakpoint.addEventListener("change", closeAcrossBreakpoint);
    return () => breakpoint.removeEventListener("change", closeAcrossBreakpoint);
  }, [isOpen, onClose]);

  return (
    <animated.dialog
      ref={dialogRef}
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={spring}
      className="inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-l border-line bg-surface-strong p-0 text-ink shadow-inspector backdrop:bg-ink/35 md:max-w-md"
    >
      <div className="flex min-h-full flex-col px-6 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <h1
            id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}
            className="text-lg font-semibold"
          >
            {title}
          </h1>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="focus-ring min-h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-muted"
          >
            Close
          </button>
        </header>
        <div className="flex-1 py-8">{children}</div>
      </div>
    </animated.dialog>
  );
}
