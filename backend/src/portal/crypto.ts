/**
 * CampusLynx portal cryptography.
 *
 * The JUET student portal (Angular + ASP.NET WebAPI) protects every request body
 * with AES-128-CBC. The scheme was recovered from the portal's own JS bundle and
 * then confirmed byte-for-byte against a request captured from a real browser.
 *
 *   key  = "qa8y" + dateCore + "ty1pn"          (16 ASCII bytes => AES-128)
 *   core = dd[0] mm[0] yy[0] weekday dd[1] mm[1] yy[1]
 *   iv   = "dcek9wb8frty1pnm"                    (fixed by the portal)
 *   mode = CBC, padding PKCS7
 *   body = base64( ciphertext )
 *
 * `tests/portal/crypto.test.ts` replays a genuine captured request through
 * `decrypt`/`encrypt` and asserts the ciphertext is reproduced exactly, so any
 * change to this file that breaks parity with the portal fails the suite.
 */

import crypto from "crypto";

/** Fixed initialization vector hard-coded in the portal bundle. */
const IV = "dcek9wb8frty1pnm";

const ALGORITHM = "aes-128-cbc";
const KEY_PREFIX = "qa8y";
const KEY_SUFFIX = "ty1pn";

/**
 * Alphabet used by the portal's HTTP interceptor when it builds the `LocalName`
 * nonce. Reproduced verbatim from the bundle -- note it deliberately lacks "Y"
 * and "j", so do not "fix" it.
 */
const NONCE_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

/** Number of random characters in a `LocalName` nonce (4 prefix + 5 suffix). */
const NONCE_LENGTH = 9;

/**
 * Timezone the portal's own clock is in. The date characters below are the
 * portal's, not ours, so this must NOT depend on the host's TZ: a UTC
 * deployment would otherwise be a day behind the portal from 18:30 IST and
 * encrypt every request with a key the portal cannot derive. Overridable for
 * testing only.
 */
const PORTAL_TIMEZONE = process.env.PORTAL_TIMEZONE || "Asia/Kolkata";

type DateParts = { day: string; month: string; year: string; weekday: number };

function portalDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = get("year");
  const month = get("month");
  const day = get("day");

  return {
    day,
    month,
    year,
    // Weekday of the portal's calendar date, not of the UTC instant.
    weekday: new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay(),
  };
}

/**
 * The 7 date characters the portal mixes into its key and nonce, read in the
 * portal's timezone with a 2-digit year.
 */
export function dateCore(date: Date = new Date()): string {
  const { day: dd, month: mm, year, weekday } = portalDateParts(date);
  const yy = year.slice(-2);
  return [dd[0], mm[0], yy[0], weekday, dd[1], mm[1], yy[1]].join("");
}

/** Derive the 16-character AES key for a given moment in time. */
export function deriveKey(date: Date = new Date()): string {
  return KEY_PREFIX + dateCore(date) + KEY_SUFFIX;
}

/**
 * Encrypt a UTF-8 string exactly as the portal does.
 * @returns base64 ciphertext, ready to be used as the HTTP request body
 */
export function encrypt(plaintext: string, key: string = deriveKey()): string {
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(key, "utf8"),
    Buffer.from(IV, "utf8")
  );
  return Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]).toString("base64");
}

/** Inverse of {@link encrypt}. Primarily used by the parity tests. */
export function decrypt(ciphertext: string, key: string = deriveKey()): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(key, "utf8"),
    Buffer.from(IV, "utf8")
  );
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Serialize a value to JSON and encrypt it into a request body. */
export function encryptBody(payload: unknown, key?: string): string {
  return encrypt(JSON.stringify(payload), key);
}

function randomNonce(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += NONCE_ALPHABET[bytes[i] % NONCE_ALPHABET.length];
  }
  return out;
}

/**
 * Build the `LocalName` header the portal's interceptor attaches to every
 * authenticated request: 4 random chars + dateCore + 5 random chars, encrypted
 * with the same scheme as the body.
 */
export function createLocalName(date: Date = new Date()): string {
  const nonce = randomNonce(NONCE_LENGTH);
  return encrypt(
    nonce.slice(0, 4) + dateCore(date) + nonce.slice(4),
    deriveKey(date)
  );
}

/** Decrypt a JWT payload segment without verifying the signature. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      )
    );
  } catch {
    return null;
  }
}

/** Epoch seconds at which a JWT expires, or `null` if not readable. */
export function jwtExpiry(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp : null;
}

/** True when the token is missing or within `skewSeconds` of expiry. */
export function isTokenExpired(token: string | undefined | null, skewSeconds = 60): boolean {
  if (!token) return true;
  const exp = jwtExpiry(token);
  if (exp === null) return true;
  return exp - skewSeconds <= Math.floor(Date.now() / 1000);
}
