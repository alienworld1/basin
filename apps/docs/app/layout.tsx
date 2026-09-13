import type { Metadata } from "next";
import Image from "next/image";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import darkBackgroundWordmark from "../../../assets/images/basin-dark-bg.png";
import lightBackgroundWordmark from "../../../assets/images/basin-light-bg.png";
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

const navbar = (
  <Navbar
    logo={
      <span className="inline-flex w-20">
        <Image
          src={lightBackgroundWordmark}
          alt="Basin"
          className="h-auto w-full dark:hidden"
          priority
        />
        <Image
          src={darkBackgroundWordmark}
          alt="Basin"
          className="hidden h-auto w-full dark:block"
          priority
        />
      </span>
    }
  />
);
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
