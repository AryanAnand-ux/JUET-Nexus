/**
 * Encryption Utilities for JSESSIONID
 * Uses Node.js built-in crypto module
 * Provides AES-256-GCM encryption with authentication
 */

import crypto from "crypto";
import type { AuthPayload } from "../routes/auth";

// 256-bit (32 bytes) for AES-256
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for GCM

/**
 * Validates encryption key format
 */
export function validateKey(key?: string): void {
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable not set");
  }

  if (key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (256 bits). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  // Verify it's valid hex
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error("ENCRYPTION_KEY must be valid hexadecimal");
  }
}

/**
 * Encrypt JSESSIONID cookie value
 * @param jsessionid - The session ID to encrypt
 * @returns Encrypted token as hex string (IV + ciphertext + authTag)
 */
export function encryptSession(jsessionid: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  validateKey(encryptionKey);

  const key = Buffer.from(encryptionKey!, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(jsessionid, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: IV (32 hex chars) + authTag (32 hex chars) + ciphertext
  const token = iv.toString("hex") + authTag.toString("hex") + encrypted;

  return token;
}

/**
 * Decrypt JSESSIONID from encrypted token
 * @param token - Encrypted token (IV + authTag + ciphertext in hex)
 * @returns Decrypted session ID
 */
export function decryptSession(token: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  validateKey(encryptionKey);

  try {
    const key = Buffer.from(encryptionKey!, "hex");

    // Parse token format: IV (32 hex) + authTag (32 hex) + ciphertext
    const iv = Buffer.from(token.substring(0, 32), "hex");
    const authTag = Buffer.from(token.substring(32, 64), "hex");
    const encrypted = token.substring(64);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt session token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Utility: Generate a new encryption key
 * Use this to set ENCRYPTION_KEY environment variable
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface SessionData {
  jsessionid: string;
  enrollment: string;
  password: string;
  dob: string;
  role: AuthPayload["role"];
}

/**
 * Encrypt SessionData payload as JSON
 * @param data - The session data to encrypt
 * @returns Encrypted token as hex string
 */
export function encryptSessionData(data: SessionData): string {
  return encryptSession(JSON.stringify(data));
}

/**
 * Decrypt SessionData from encrypted token, falling back to legacy plain string format if JSON parsing fails
 * @param token - Encrypted token
 * @returns Decrypted SessionData payload
 */
export function decryptSessionData(token: string): SessionData {
  const decrypted = decryptSession(token);
  try {
    const parsed = JSON.parse(decrypted);
    if (parsed && typeof parsed === "object" && "jsessionid" in parsed) {
      return parsed as SessionData;
    }
    return {
      jsessionid: decrypted,
      enrollment: "",
      password: "",
      dob: "",
      role: "Student"
    };
  } catch (error) {
    return {
      jsessionid: decrypted,
      enrollment: "",
      password: "",
      dob: "",
      role: "Student"
    };
  }
}
