import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(secret) {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function hashManageToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptManageToken(token, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptManageToken(encryptedToken, secret) {
  const value = Buffer.from(encryptedToken, "base64url");
  if (value.length < 29) {
    throw new Error("Invalid encrypted booking management token.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    value.subarray(0, 12),
  );
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([
    decipher.update(value.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
