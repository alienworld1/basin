import "server-only";

export type AppMetadata = {
  name: string;
  title: string;
  description: string;
  canonicalUrl: string;
};

function getCanonicalUrl() {
  const configuredUrl = process.env.APP_URL?.trim();
  const environment = process.env.APP_ENV ?? "development";

  if (!configuredUrl) {
    if (environment !== "development") {
      throw new Error("Set a valid canonical application URL.");
    }
    return "http://localhost:3000";
  }

  try {
    const url = new URL(configuredUrl);
    if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error("Set a valid canonical application URL.");
  }
}

export const appMetadata: AppMetadata = {
  name: "Basin",
  title: "Basin · Payment relationships",
  description:
    "Approve who your organization pays while payees control where they receive.",
  canonicalUrl: getCanonicalUrl(),
};
