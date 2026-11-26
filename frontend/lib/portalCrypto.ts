/**
 * portalCrypto.ts
 *
 * Isomorphic WebCrypto port of the CampusLynx portal AES-128-CBC encryption.
 * Uses globalThis.crypto.subtle only — no node:crypto, no Buffer — so it
 * bundles for the browser and runs in edge runtimes (Vercel API routes).
 */

const IV = "dcek9wb8frty1pnm";
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

const te = new TextEncoder();
const IV_BYTES = te.encode(IV);

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Module-level cached Intl formatter — constructing one is expensive.
const istFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

let lastIstMinute = -1;
let lastIstParts: { day: string; month: string; yy: string; dow: string } | null = null;

/** Return date components in Indian Standard Time (IST, UTC+05:30). */
export function getIstParts(date = new Date()) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  const minuteBucket = Number.isFinite(ms) ? Math.floor(ms / 60_000) : -1;
  if (minuteBucket !== -1 && minuteBucket === lastIstMinute && lastIstParts) {
    return { ...lastIstParts };
  }
  const parts = istFormatter.formatToParts(date);
  let day = "";
  let month = "";
  let year = "";
  let weekday = "";
  for (const p of parts) {
    if (p.type === "day") day = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "year") year = p.value;
    else if (p.type === "weekday") weekday = p.value;
  }
  const dow = String(DAYS.indexOf(weekday));
  const yy = year.slice(2);
  const res = { day, month, yy, dow };
  if (minuteBucket !== -1) {
    lastIstMinute = minuteBucket;
    lastIstParts = res;
  }
  return { ...res };
}

/** Date-derived 16-char AES key in IST. Pure + deterministic. */
export function generateValue(date = new Date()): string {
  const { day, month, yy, dow } = getIstParts(date);
  return `qa8y${day[0]}${month[0]}${yy[0]}${dow}${day[1]}${month[1]}${yy[1]}ty1pn`;
}

function getSubtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s)
    throw new Error(
      "WebCrypto Subtle unavailable — requires https:// or localhost"
    );
  return s;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Key cache: generateValue → Promise<CryptoKey>  (up to 4 entries)
const keyCache = new Map<string, Promise<CryptoKey>>();

export async function importKey(now = new Date()): Promise<CryptoKey> {
  const val = generateValue(now);
  let promise = keyCache.get(val);
  if (promise) {
    // LRU: move to end
    keyCache.delete(val);
    keyCache.set(val, promise);
    return promise;
  }
  if (keyCache.size >= 4) keyCache.delete(keyCache.keys().next().value!);
  promise = getSubtle()
    .importKey("raw", te.encode(val), "AES-CBC", false, ["encrypt", "decrypt"])
    .catch((err) => {
      keyCache.delete(val);
      throw err;
    });
  keyCache.set(val, promise);
  return promise;
}

/** AES-128-CBC encrypt(plainText, key, iv) → Base64. */
export async function encrypt(
  plainText: string,
  { now = new Date() }: { now?: Date } = {}
): Promise<string> {
  const key = await importKey(now);
  const ct = await getSubtle().encrypt(
    { name: "AES-CBC", iv: IV_BYTES },
    key,
    te.encode(plainText)
  );
  return bytesToB64(new Uint8Array(ct));
}

/** Encrypt a JSON payload object — used for portal request bodies. */
export async function encryptBody(
  payload: object,
  opts?: { now?: Date }
): Promise<string> {
  return encrypt(JSON.stringify(payload), opts);
}

/**
 * Per-request LocalName header value.
 * plain = rand4 + date7 + rand5 (16 chars), then AES-128-CBC encrypted.
 */
export async function makeLocalName({
  now = new Date(),
  random = Math.random,
}: { now?: Date; random?: () => number } = {}): Promise<{
  plain: string;
  encrypted: string;
}> {
  const pick = () => ALPHABET[Math.floor(random() * ALPHABET.length)];
  const h = Array.from({ length: 4 }, pick).join("");
  const m = Array.from({ length: 5 }, pick).join("");
  const plain = `${h}${generateValue(now).slice(4, 11)}${m}`;
  return { plain, encrypted: await encrypt(plain, { now }) };
}

// ── JWT helpers ─────────────────────────────────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

/** Returns the JWT expiry as a Unix timestamp (seconds). */
export function jwtExpiry(token: string): number {
  const payload = decodeJwtPayload(token);
  return typeof payload.exp === "number" ? payload.exp : 0;
}

/** True if the token is expired or will expire within `bufferSec` seconds. */
export function isTokenExpired(token: string, bufferSec = 60): boolean {
  if (!token) return true;
  return jwtExpiry(token) - bufferSec < Date.now() / 1000;
}

export { IV };
