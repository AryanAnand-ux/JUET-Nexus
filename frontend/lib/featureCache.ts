/**
 * featureCache.ts
 *
 * Two-layer SWR cache for portal data:
 *   Layer 1: in-memory Map (synchronous, zero-latency)
 *   Layer 2: localStorage (persists across reloads, shared across tabs)
 *
 * Includes cross-tab `storage` listener and `AbortController`
 * tracking so logout immediately aborts in-flight requests and invalidates
 * all open tabs.
 */

const STORAGE_PREFIX = "juet.cache.v1.";
/** Default stale time before a cached entry triggers a background revalidation. */
export const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  ts: number; // Date.now() when stored
}

// Layer 1: in-memory (fastest path)
const memCache = new Map<string, CacheEntry<unknown>>();

// Deduplication of in-flight network requests with AbortController tracking
const inFlight = new Map<
  string,
  { promise: Promise<unknown>; controller: AbortController }
>();

// Generation counter — incremented on logout to bust all keys
let cacheGeneration = 0;
let storageListenerBound = false;

function ensureStorageListener(): void {
  if (
    storageListenerBound ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }
  storageListenerBound = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (!e.key) {
      memCache.clear();
    } else if (e.key === "juet.session" && !e.newValue) {
      invalidateCacheGeneration();
    } else if (e.key.startsWith(STORAGE_PREFIX)) {
      memCache.delete(e.key.slice(STORAGE_PREFIX.length));
    }
  });
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function lsKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Synchronous read: memory → localStorage. Returns null on miss. */
export function getCached<T>(key: string): CacheEntry<T> | null {
  ensureStorageListener();
  const mem = memCache.get(key);
  if (mem) return mem as CacheEntry<T>;
  try {
    const raw = safeStorage()?.getItem(lsKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry?.ts !== "number") return null;
    memCache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Write to both layers. */
export function setCached<T>(key: string, data: T): void {
  ensureStorageListener();
  const entry: CacheEntry<T> = { data, ts: Date.now() };
  memCache.set(key, entry);
  try {
    safeStorage()?.setItem(lsKey(key), JSON.stringify(entry));
  } catch {
    // localStorage full — memory-only is fine
  }
}

/** Remove a single key from both layers. */
export function evictCached(key: string): void {
  memCache.delete(key);
  try {
    safeStorage()?.removeItem(lsKey(key));
  } catch {
    /* ignore */
  }
}

/**
 * Request a feature value, deduplicating concurrent callers.
 * If a fetch for `key` is already in-flight, all callers share its result.
 */
export async function requestFeature<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing.promise as Promise<T>;

  const gen = cacheGeneration;
  const controller = new AbortController();
  const entry = {
    controller,
    promise: run(controller.signal)
      .then((data) => {
        if (gen === cacheGeneration && !controller.signal.aborted) {
          setCached(key, data);
        }
        return data;
      })
      .finally(() => {
        if (inFlight.get(key) === entry) {
          inFlight.delete(key);
        }
      }),
  };

  inFlight.set(key, entry);
  return entry.promise;
}

/**
 * Build a namespaced cache key scoped to the user's enrollment and feature name.
 * Extra parts (e.g. semester, subject ID) are appended.
 */
export function sessionCacheKey(
  feature: string,
  enrollment: string,
  ...parts: string[]
): string {
  const extra = parts.length ? `.${parts.join(".")}` : "";
  return `${enrollment.toUpperCase()}.${feature}${extra}.g${cacheGeneration}`;
}

/**
 * Increment the generation counter, abort all in-flight fetches, and clear
 * in-memory cache. Called on logout.
 */
export function invalidateCacheGeneration(): void {
  cacheGeneration++;
  for (const req of inFlight.values()) {
    req.controller.abort();
  }
  inFlight.clear();
  memCache.clear();
  const storage = safeStorage();
  if (storage) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        storage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }
}

/** True if the cache entry is fresh (within staleMs). */
export function isFresh(entry: CacheEntry<unknown>, staleMs = DEFAULT_STALE_MS): boolean {
  return Date.now() - entry.ts < staleMs;
}
