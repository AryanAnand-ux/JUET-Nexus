import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateValue,
  encrypt,
  makeLocalName,
  jwtExpiry,
  isTokenExpired,
  IV,
} from "../lib/portalCrypto.ts";
import {
  getCached,
  setCached,
  requestFeature,
  sessionCacheKey,
  invalidateCacheGeneration,
} from "../lib/featureCache.ts";

test("portalCrypto: generateValue & encrypt match Node AES-128-CBC byte-for-byte", async () => {
  const fixedDate = new Date("2026-11-26T18:30:00.000Z"); // 2026-11-27 00:00 IST (Fri=5)
  const key = generateValue(fixedDate);
  assert.equal(key.length, 16);

  const payload = JSON.stringify({ username: "221B001", usertype: "S" });
  const subtleCipher = await encrypt(payload, { now: fixedDate });

  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(IV, "utf8")
  );
  const nodeCipher = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]).toString("base64");

  assert.equal(subtleCipher, nodeCipher);
});

test("portalCrypto: makeLocalName produces 16-char plain & valid base64 ciphertext", async () => {
  const { plain, encrypted } = await makeLocalName({
    now: new Date("2026-11-26T18:30:00.000Z"),
  });
  assert.equal(plain.length, 16);
  assert.ok(encrypted.length > 0);
  const expected = await encrypt(plain, {
    now: new Date("2026-11-26T18:30:00.000Z"),
  });
  assert.equal(encrypted, expected);
});

test("portalCrypto: jwtExpiry & isTokenExpired", () => {
  const futureExp = Math.floor(Date.now() / 1000) + 600;
  const pastExp = Math.floor(Date.now() / 1000) - 60;
  const makeJwt = (exp: number) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

  assert.equal(jwtExpiry(makeJwt(futureExp)), futureExp);
  assert.equal(isTokenExpired(makeJwt(futureExp)), false);
  assert.equal(isTokenExpired(makeJwt(pastExp)), true);
  assert.equal(isTokenExpired(""), true);
});

test("featureCache: deduplicates concurrent requestFeature calls and aborts on logout", async () => {
  const key = sessionCacheKey("dashboard", "221b001");
  let calls = 0;
  const resultPromise1 = requestFeature(key, async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true };
  });
  const resultPromise2 = requestFeature(key, async () => {
    calls++;
    return { ok: false };
  });

  const [r1, r2] = await Promise.all([resultPromise1, resultPromise2]);
  assert.equal(calls, 1);
  assert.deepEqual(r1, { ok: true });
  assert.deepEqual(r2, { ok: true });
  assert.deepEqual(getCached<{ ok: boolean }>(key)?.data, { ok: true });

  // Logout generation invalidates old key and aborts in-flight requests
  let aborted = false;
  const pendingKey = sessionCacheKey("exam", "221b001");
  const pending = requestFeature(pendingKey, (signal) => {
    return new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        resolve({ aborted: true });
      });
    });
  });

  invalidateCacheGeneration();
  await pending;
  assert.equal(aborted, true);
  const nextKey = sessionCacheKey("dashboard", "221b001");
  assert.notEqual(nextKey, key);
  setCached(nextKey, { fresh: true });
  assert.deepEqual(getCached<{ fresh: boolean }>(nextKey)?.data, { fresh: true });
});
