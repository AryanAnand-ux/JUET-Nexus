/**
 * session.ts
 *
 * Client-side session and credentials store for JUET Nexus (one-hop architecture).
 *
 * Session (token + portal identity) → localStorage "juet.session"
 * Credentials (password)            → localStorage "juet.credentials.v1" via IndexedDB-
 *                                     backed AES-GCM key (non-exportable).
 */

"use client";

export interface JuetSession {
  enrollment: string;
  token: string;
  tokenExpiry: number; // Unix seconds
  name: string;
  branch: string;
  semester: string;
  // CampusLynx identity fields required by portal data endpoints
  clientid: string;
  instituteid: string;
  companyid: string;
  memberid: string;
  membertype: string;
  userid?: string;
  username: string;
  otppwd: string;
  institutename?: string;
  bypass?: string;
  tokendate?: string;
  issuedAt?: number;
  profile?: Record<string, unknown>;
}

const SESSION_KEY = "juet.session";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSession(): JuetSession | null {
  try {
    const raw = safeStorage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.enrollment === "string" &&
      typeof parsed?.token === "string" &&
      parsed.token.length > 0
    ) {
      return parsed as JuetSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: JuetSession): void {
  try {
    safeStorage()?.setItem(SESSION_KEY, JSON.stringify(session));
    // Keep legacy enrollment/role keys synced for any existing UI readers
    safeStorage()?.setItem("enrollment", session.enrollment.toUpperCase());
    safeStorage()?.setItem("role", "Student");
  } catch {
    // quota exceeded or private mode
  }
}

export function clearSession(): void {
  try {
    const s = safeStorage();
    s?.removeItem(SESSION_KEY);
    s?.removeItem("enrollment");
    s?.removeItem("role");
    s?.removeItem("sessionToken");
  } catch {
    /* ignore */
  }
}

// ── Credentials (password) — IndexedDB-backed AES-GCM ───────────────────────

const CRED_KEY = "juet.credentials.v1";
const DB_NAME = "juet.portal.credentials";
const encoder = new TextEncoder();

function openCredDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("IndexedDB open timed out")),
      2000
    );
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error("Credential storage blocked"));
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
  });
}

async function getOrCreateCryptoKey(
  candidate: CryptoKey
): Promise<{ key: CryptoKey; persistent: boolean }> {
  try {
    const db = await openCredDb();
    return await new Promise<{ key: CryptoKey; persistent: boolean }>(
      (resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        const store = tx.objectStore("keys");
        const getReq = store.get("password");
        let key: CryptoKey | undefined;
        getReq.onsuccess = () => {
          key = getReq.result;
          if (!key) {
            key = candidate;
            store.put(key, "password");
          }
        };
        tx.oncomplete = () => resolve({ key: key!, persistent: true });
        tx.onabort = tx.onerror = () => reject(tx.error);
      }
    ).finally(() => db.close());
  } catch {
    return { key: candidate, persistent: false };
  }
}

async function loadCryptoKey(): Promise<CryptoKey | null> {
  try {
    const db = await openCredDb();
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction("keys", "readonly");
      const req = tx.objectStore("keys").get("password");
      req.onsuccess = () => resolve(req.result ?? null);
      tx.onabort = tx.onerror = () => reject(tx.error);
    }).finally(() => db.close());
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr));
}
function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return view;
}
function additionalData(enrollment: string): Uint8Array<ArrayBuffer> {
  const str = JSON.stringify([1, enrollment.toUpperCase()]);
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i);
  return view;
}

interface CredRecord {
  version: 1;
  enrollment: string;
  iv: string;
  data: string;
}

function readCredRecord(): CredRecord | null {
  try {
    const raw = safeStorage()?.getItem(CRED_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (
      r?.version === 1 &&
      typeof r.enrollment === "string" &&
      typeof r.iv === "string" &&
      typeof r.data === "string"
    )
      return r as CredRecord;
    return null;
  } catch {
    return null;
  }
}

/** Save the user's password encrypted with a non-exportable device key. */
export async function saveCredentials(
  enrollment: string,
  password: string
): Promise<void> {
  if (!password || typeof window === "undefined") return;
  try {
    const subtle = window.crypto.subtle;
    const candidate = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    const { key } = await getOrCreateCryptoKey(candidate);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = enrollment.toUpperCase();
    const ad = additionalData(enc);
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: ad },
      key,
      encoder.encode(password)
    );
    const record: CredRecord = {
      version: 1,
      enrollment: enc,
      iv: toBase64(iv),
      data: toBase64(ciphertext),
    };
    safeStorage()?.setItem(CRED_KEY, JSON.stringify(record));
  } catch {
    // If encryption fails, don't store plaintext
  }
}

/** Load the saved password for the given enrollment, or null if unavailable. */
export async function loadCredentials(
  enrollment: string
): Promise<{ enrollment: string; password: string } | null> {
  if (typeof window === "undefined") return null;
  try {
    const record = readCredRecord();
    if (!record || record.enrollment !== enrollment.toUpperCase()) return null;
    const key = await loadCryptoKey();
    if (!key) return null;
    const subtle = window.crypto.subtle;
    const bytes = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(record.iv),
        additionalData: additionalData(record.enrollment),
      },
      key,
      fromBase64(record.data)
    );
    const password = new TextDecoder().decode(bytes);
    return { enrollment: record.enrollment, password };
  } catch {
    return null;
  }
}

/** Remove stored credentials (called on logout). */
export function clearCredentials(): void {
  try {
    safeStorage()?.removeItem(CRED_KEY);
  } catch {
    /* ignore */
  }
}

export function hasCredentials(enrollment: string): boolean {
  const record = readCredRecord();
  return record?.enrollment === enrollment.toUpperCase();
}
