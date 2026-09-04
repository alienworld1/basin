"use client";

import { ErrorState } from "@/src/ui/error-state";

import { ibmPlexMono, instrumentSans } from "./fonts";
import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <ErrorState title="Basin couldn't load." onRetry={reset} />
      </body>
    </html>
  );
}
