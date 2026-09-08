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
  allowedDevOrigins: getWebhookDevOrigin(),
};

export default nextConfig;
