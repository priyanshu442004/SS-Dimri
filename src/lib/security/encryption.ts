import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

// AES-256-GCM field encryption for Aadhaar and bank account numbers.
// Format: v1.<iv>.<authTag>.<ciphertext> (each part base64url).
const VERSION = "v1";

function key() {
  return Buffer.from(serverEnv().DATA_ENCRYPTION_KEY, "base64");
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptField(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unsupported encrypted field format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Encrypted value + last four characters for display (e.g. "XXXX XXXX 1234"). */
export function encryptWithLast4(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return { encrypted: encryptField(normalized), last4: normalized.slice(-4) };
}
