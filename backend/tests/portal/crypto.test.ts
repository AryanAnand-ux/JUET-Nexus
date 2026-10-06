/**
 * Parity tests for the CampusLynx request cipher.
 *
 * `campuslynx-cipher.json` holds a genuine `pretoken-check` request captured
 * from the portal in a real browser, together with the key the portal used for
 * it. These tests are the guard rail for the crypto module: if key derivation,
 * IV, mode or padding drift, the replay below stops matching.
 */

import {
  dateCore,
  deriveKey,
  encrypt,
  decrypt,
  encryptBody,
  createLocalName,
  decodeJwtPayload,
  jwtExpiry,
  isTokenExpired,
} from "../../src/portal/crypto";

const fixture = require("../fixtures/campuslynx-cipher.json");

describe("CampusLynx cipher parity", () => {
  test("dateCore matches the portal's 7-character mix", () => {
    // 2026-09-30 is a Wednesday, so weekday === 3.
    expect(dateCore(new Date(2026, 8, 30))).toBe("3023096");
  });

  test("dateCore zero-pads single digit days and months", () => {
    // 2026-01-02 is a Friday: dd="02" mm="01" yy="26" weekday=5 -> "0025216"
    expect(dateCore(new Date(2026, 0, 2))).toBe("0025216");
  });

  test("reads the calendar date in the portal's timezone, not the host's", () => {
    // 18:45 UTC on 30 Sep is already 00:45 on 1 Oct in Asia/Kolkata (a
    // Thursday). A host running in UTC would derive the previous day's
    // characters here and key every request the portal cannot decrypt -- which
    // the portal answers with 200 and an empty body, i.e. "wrong captcha".
    // The expected value is therefore the IST one: 01/10/26, weekday 4.
    expect(dateCore(new Date("2026-09-30T18:45:00Z"))).toBe("0124106");
  });

  test("deriveKey reproduces the key the portal used on 2026-09-30", () => {
    expect(deriveKey(new Date(2026, 8, 30))).toBe(fixture.key);
    expect(fixture.key).toHaveLength(16);
  });

  test("decrypts a real browser request into the expected JSON", () => {
    const plaintext = decrypt(fixture.ciphertext, fixture.key);
    const parsed = JSON.parse(plaintext);

    expect(parsed.username).toBe(fixture.username);
    expect(parsed.usertype).toBe(fixture.usertype);
    expect(parsed.captcha.captcha).toBe(fixture.captchaAnswer);
    expect(parsed.captcha.hidden).toBe(fixture.captchaHidden);
    // The captcha image travels as a bare base64 PNG, not a data: URI.
    expect(parsed.captcha.image).toMatch(/^iVBORw0KGgo/);
  });

  test("re-encrypting the browser plaintext reproduces its ciphertext exactly", () => {
    const plaintext = decrypt(fixture.ciphertext, fixture.key);
    expect(encrypt(plaintext, fixture.key)).toBe(fixture.ciphertext);
  });

  test("round-trips through encryptBody/encrypt", () => {
    const key = deriveKey(new Date(2026, 8, 30));
    const payload = { hello: "world", n: 42, nested: { list: [1, 2, 3] } };
    expect(decrypt(encryptBody(payload, key), key)).toBe(JSON.stringify(payload));
  });

  test("wrong key cannot decrypt", () => {
    expect(() => decrypt(fixture.ciphertext, "qa8y0000000ty1pn")).toThrow();
  });
});

describe("LocalName nonce", () => {
  test("is base64 and long enough to cover a 16-char plaintext", () => {
    const localName = createLocalName(new Date(2026, 8, 30));
    expect(localName).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // 16 bytes of plaintext pads up to the next AES block -> 32 base64 chars.
    expect(localName.length).toBeGreaterThanOrEqual(32);
  });

  test("embeds the same dateCore the key uses", () => {
    const date = new Date(2026, 8, 30);
    const plaintext = decrypt(createLocalName(date), deriveKey(date));
    expect(plaintext).toContain(dateCore(date));
    expect(plaintext).toHaveLength(16);
  });

  test("is randomised per call", () => {
    const date = new Date(2026, 8, 30);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) seen.add(createLocalName(date));
    expect(seen.size).toBeGreaterThan(20);
  });

  test("only ever uses characters from the portal alphabet", () => {
    const date = new Date(2026, 8, 30);
    const plaintext = decrypt(createLocalName(date), deriveKey(date));
    const alphabet =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    for (const ch of plaintext) expect(alphabet).toContain(ch);
  });
});

describe("JWT helpers", () => {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");

  test("reads exp from an unsigned token", () => {
    const token = `${b64({ alg: "HS256" })}.${b64({ exp: 9999999999 })}.sig`;
    expect(jwtExpiry(token)).toBe(9999999999);
    expect(isTokenExpired(token)).toBe(false);
  });

  test("treats past tokens as expired", () => {
    const token = `${b64({ alg: "HS256" })}.${b64({ exp: 1000 })}.sig`;
    expect(isTokenExpired(token)).toBe(true);
  });

  test("treats missing and malformed tokens as expired", () => {
    expect(isTokenExpired(undefined)).toBe(true);
    expect(isTokenExpired("")).toBe(true);
    expect(isTokenExpired("not-a-jwt")).toBe(true);
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });

  test("applies a refresh skew so a token is rotated before it dies", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: "HS256" })}.${b64({ exp: now + 30 })}.sig`;
    expect(isTokenExpired(token, 60)).toBe(true);
    expect(isTokenExpired(token, 10)).toBe(false);
  });
});
