import type { Metadata } from "next";

import { appMetadata } from "@/src/server/config/app-metadata";
import { BasinAuthProvider } from "@/src/ui/auth/auth-provider";

import { ibmPlexMono, instrumentSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appMetadata.canonicalUrl),
  title: {
    default: appMetadata.title,
    template: `%s · ${appMetadata.name}`,
  },
  description: appMetadata.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-sm bg-ink px-4 py-3 text-sm font-medium text-bg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <BasinAuthProvider>{children}</BasinAuthProvider>
      </body>
    </html>
  );
}
