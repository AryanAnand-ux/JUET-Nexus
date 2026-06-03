/**
 * Unit Tests for Encryption Utilities
 * Tests encryption/decryption round-trip and edge cases
 */

import { encryptSession, decryptSession, generateEncryptionKey } from "../src/utils/encryption";

// Mock environment for testing
const TEST_ENCRYPTION_KEY = "0".repeat(64); // Valid hex
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

describe("Encryption Utilities", () => {
  describe("encryptSession & decryptSession", () => {
    it("should encrypt and decrypt a JSESSIONID", () => {
      const jsessionid = "ABCD1234567890EF";
      const encrypted = encryptSession(jsessionid);
      const decrypted = decryptSession(encrypted);

      expect(decrypted).toBe(jsessionid);
    });

    it("should handle long JSESSIONID strings", () => {
      const jsessionid =
        "LONG_SESSION_ID_" +
        "0".repeat(100) +
        "_WITH_MANY_CHARACTERS";
      const encrypted = encryptSession(jsessionid);
      const decrypted = decryptSession(encrypted);

      expect(decrypted).toBe(jsessionid);
    });

    it("should handle special characters in JSESSIONID", () => {
      const jsessionid = "SESSION-ID_123.456+789=";
      const encrypted = encryptSession(jsessionid);
      const decrypted = decryptSession(encrypted);

      expect(decrypted).toBe(jsessionid);
    });

    it("should generate different tokens for same input (random IV)", () => {
      const jsessionid = "TEST_SESSION";
      const encrypted1 = encryptSession(jsessionid);
      const encrypted2 = encryptSession(jsessionid);

      // Tokens should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(decryptSession(encrypted1)).toBe(jsessionid);
      expect(decryptSession(encrypted2)).toBe(jsessionid);
    });

    it("should throw error on invalid encrypted token", () => {
      const invalidToken = "invalid_hex_string_too_short";

      expect(() => decryptSession(invalidToken)).toThrow();
    });

    it("should throw error on tampered ciphertext", () => {
      const jsessionid = "ORIGINAL_SESSION";
      const encrypted = encryptSession(jsessionid);

      // Tamper with ciphertext (last part)
      const tampered = encrypted.substring(0, encrypted.length - 5) + "00000";

      expect(() => decryptSession(tampered)).toThrow();
    });

    it("should throw error on tampered auth tag", () => {
      const jsessionid = "ORIGINAL_SESSION";
      const encrypted = encryptSession(jsessionid);

      // Tamper with auth tag (middle part)
      const authTagStart = 32;
      const authTagEnd = 64;
      const tampered =
        encrypted.substring(0, authTagStart) +
        "f".repeat(32) +
        encrypted.substring(authTagEnd);

      expect(() => decryptSession(tampered)).toThrow();
    });
  });

  describe("generateEncryptionKey", () => {
    it("should generate valid 256-bit hex keys", () => {
      const key = generateEncryptionKey();

      // Should be 64 hex characters (256 bits)
      expect(key).toMatch(/^[0-9a-f]{64}$/i);
      expect(key.length).toBe(64);
    });

    it("should generate different keys each time", () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe("environment validation", () => {
    it("should throw if ENCRYPTION_KEY is not set", () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => encryptSession("TEST")).toThrow(
        /ENCRYPTION_KEY environment variable not set/
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw if ENCRYPTION_KEY has invalid length", () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "invalid_short_key";

      expect(() => encryptSession("TEST")).toThrow(
        /must be 64 hex characters/
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it("should throw if ENCRYPTION_KEY has invalid hex characters", () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "G".repeat(64); // G is not valid hex

      expect(() => encryptSession("TEST")).toThrow(
        /must be valid hexadecimal/
      );

      process.env.ENCRYPTION_KEY = originalKey;
    });
  });
});
