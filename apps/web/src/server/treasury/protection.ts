import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

export type SealedRoutineKey = {
  publicKey: string;
  publicKeyFingerprint: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
};

export function fingerprint(value: string) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function generateRoutineKey(
  organizationId: bigint,
  secret: { key: Buffer; version: string },
): SealedRoutineKey {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = pair.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "der" });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret.key, iv);
  cipher.setAAD(
    Buffer.from(`basin:treasury:${organizationId}:${secret.version}`),
  );
  const ciphertext = Buffer.concat([cipher.update(privateKey), cipher.final()]);
  privateKey.fill(0);
  return {
    publicKey,
    publicKeyFingerprint: fingerprint(publicKey),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: secret.version,
  };
}

export function unsealRoutineKey(
  organizationId: bigint,
  record: {
    ciphertext: string;
    iv: string;
    auth_tag: string;
    key_version: string;
  },
  secret: { key: Buffer; version: string },
) {
  if (record.key_version !== secret.version)
    throw new Error("SIGNER_UNAVAILABLE");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret.key,
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAAD(
    Buffer.from(`basin:treasury:${organizationId}:${secret.version}`),
  );
  decipher.setAuthTag(Buffer.from(record.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]);
}

/** Privy expects base64 PKCS#8 bytes, without PEM headers. */
export function encodeRoutineAuthorizationKey(privateKey: Buffer) {
  return privateKey.toString("base64");
}
