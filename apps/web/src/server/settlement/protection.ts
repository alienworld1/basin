import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type ProtectionKey = { version: string; key: Buffer };
export function protectionKey(): ProtectionKey {
  const version = process.env.SETTLEMENT_KEY_VERSION;
  const encoded = process.env.SETTLEMENT_ENCRYPTION_KEY;
  if (
    !version ||
    !/^[a-zA-Z0-9_-]{1,16}$/.test(version) ||
    !encoded ||
    !/^[0-9a-fA-F]{64}$/.test(encoded)
  )
    throw new Error("Receiving account storage is unavailable.");
  return { version, key: Buffer.from(encoded, "hex") };
}
export function seal(value: string, context: string, secret = protectionKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret.key, nonce);
  cipher.setAAD(Buffer.from(`basin:receiving:1:${secret.version}:${context}`));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `1.${secret.version}.${nonce.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}
export function unseal(
  envelope: string,
  context: string,
  secret = protectionKey(),
) {
  try {
    const [format, version, nonce, encrypted, tag, extra] = envelope.split(".");
    if (
      format !== "1" ||
      version !== secret.version ||
      extra !== undefined ||
      !nonce ||
      !encrypted ||
      !tag
    )
      throw new Error();
    const bytes = [nonce, encrypted, tag].map((value) => {
      const buffer = Buffer.from(value, "base64url");
      if (buffer.toString("base64url") !== value) throw new Error();
      return buffer;
    });
    if (bytes[0].length !== 12 || bytes[2].length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", secret.key, bytes[0]);
    decipher.setAAD(Buffer.from(`basin:receiving:1:${version}:${context}`));
    decipher.setAuthTag(bytes[2]);
    return Buffer.concat([
      decipher.update(bytes[1]),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("We couldn't read your protected receiving details.");
  }
}
export const preferenceContext = (workspace: bigint, identity: bigint) =>
  `preference:${workspace}:${identity}`;
export const operationContext = (
  workspace: bigint,
  identity: bigint,
  relationship: bigint,
  key: string,
) => `operation:${workspace}:${identity}:${relationship}:${key}`;
export const versionContext = (
  workspace: bigint,
  identity: bigint,
  generation: bigint,
  epoch: string,
) => `version:${workspace}:${identity}:${generation}:${epoch}`;
