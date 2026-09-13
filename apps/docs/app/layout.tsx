import type { Metadata } from "next";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import { ibmPlexMono, instrumentSans } from "./fonts";
import "./globals.css";

const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(docsUrl),
  title: { default: "Basin documentation", template: "%s | Basin" },
  description: "Documentation for Basin's payment-relationship protocol on Ethereum Sepolia.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", title: "Basin documentation", description: "Payment relationships, not wallet whitelists." },
  robots: { index: process.env.DOCS_DEPLOYMENT_CLASS !== "preview", follow: process.env.DOCS_DEPLOYMENT_CLASS !== "preview" },
};

const navbar = <Navbar logo={<b>Basin</b>} />;
const footer = <Footer>Payment relationships, not wallet whitelists.</Footer>;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <Layout navbar={navbar} footer={footer} pageMap={await getPageMap()} docsRepositoryBase="https://github.com/alienworld1/basin/tree/main/apps/docs/content">
          {children}
        </Layout>
      </body>
    </html>
  );
}
