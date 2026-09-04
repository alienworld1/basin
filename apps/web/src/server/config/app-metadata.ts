import "server-only";

import { getServerEnvironment } from "./environment";

const environment = getServerEnvironment();

export type AppMetadata = {
  name: string;
  title: string;
  description: string;
  canonicalUrl: string;
};

export const appMetadata: AppMetadata = {
  name: "Basin",
  title: "Basin · Payment relationships",
  description:
    "Approve who your organization pays while payees control where they receive.",
  canonicalUrl: environment.APP_URL ?? "http://localhost:3000",
};
