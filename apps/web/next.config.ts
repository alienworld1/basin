import type { NextConfig } from "next";

function getWebhookDevOrigin(): string[] {
  const webhookUrl = process.env.PRIVY_WEBHOOK_PUBLIC_URL?.trim();

  if (!webhookUrl) {
    return [];
  }

  try {
    return [new URL(webhookUrl).hostname];
  } catch {
    throw new Error(
      "PRIVY_WEBHOOK_PUBLIC_URL must be a valid public webhook URL, such as https://your-tunnel.ngrok-free.dev",
    );
  }
}

const nextConfig: NextConfig = {
  experimental: { useTypeScriptCli: false },
  allowedDevOrigins: getWebhookDevOrigin(),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana$": false,
    };
    config.ignoreWarnings ??= [];
    config.ignoreWarnings.push({
      module: /[\\/]ox[\\/]_esm[\\/]tempo[\\/]internal[\\/]virtualMasterPool\.js$/,
      message: /Critical dependency: the request of a dependency is an expression/,
    });
    return config;
  },
  async headers() {
    return [
      {
        source: "/invite/payment-operator/:secret",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
