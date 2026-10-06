/**
 * Hermetic tests for the CampusLynx HTTP client.
 *
 * `axios` is mocked wholesale -- no network, no portal. These tests pin the
 * transport rules that the portal's Angular bundle dictates, because getting a
 * header or content-type wrong is indistinguishable from a bad password.
 */

jest.mock("axios");

import axios from "axios";
import { PortalClient } from "../../src/portal/client";
import { decrypt, createLocalName, deriveKey } from "../../src/portal/crypto";

const mockedAxios = axios as unknown as { create: jest.Mock };

type Handler = (config: any) => any;

let handlers: Record<string, Handler>;

/** Decrypt a captured request body with the key the client would have used. */
function decodeBody(body: any): any {
  return JSON.parse(decrypt(body, deriveKey()));
}

describe("PortalClient", () => {
  let client: PortalClient;
  let post: jest.Mock;
  let get: jest.Mock;

  beforeEach(() => {
    handlers = {};
    // Mirrors axios closely enough to catch body-serialisation regressions:
    // under `application/json` axios JSON-serialises the payload unless the
    // caller supplies `transformRequest`. Reproducing that here means a body
    // which would arrive JSON-quoted on the wire fails these tests.
    post = jest.fn(async (url: string, body: any, config: any) => {
      const h = handlers[url];
      if (!h) throw new Error(`unexpected POST ${url}`);
      const contentType = String(config?.headers?.["Content-Type"] || "");
      let outgoing = body;
      if (Array.isArray(config?.transformRequest)) {
        outgoing = config.transformRequest.reduce(
          (acc: unknown, fn: (d: unknown, hd: unknown) => unknown) => fn(acc, config.headers),
          body
        );
      } else if (contentType.includes("application/json") && typeof body === "string") {
        outgoing = JSON.stringify(body);
      }
      return h({ url, body: outgoing, headers: config.headers });
    });
    get = jest.fn(async (url: string, config: any) => {
      const h = handlers[url];
      if (!h) throw new Error(`unexpected GET ${url}`);
      return h({ url, headers: config?.headers });
    });

    mockedAxios.create = jest.fn(() => ({ post, get, defaults: {} })) as any;
    client = new PortalClient({ baseUrl: "https://portal.test/api" });
  });

  afterEach(() => jest.clearAllMocks());

  describe("getCaptcha", () => {
    test("returns the captcha triple", async () => {
      handlers["/token/getcaptcha"] = () => ({
        data: JSON.stringify({
          status: { responseStatus: "Success" },
          response: {
            captcha: { captcha: "", hidden: "HID==", image: "iVBORw0KGgoAAA" },
          },
        }),
      });

      const captcha = await client.getCaptcha();
      expect(captcha.hidden).toBe("HID==");
      expect(captcha.captcha).toBe("");
      expect(captcha.image).toMatch(/^iVBORw0KGgo/);
    });

    test("fails loudly when the image is missing", async () => {
      handlers["/token/getcaptcha"] = () => ({
        data: JSON.stringify({
          status: { responseStatus: "Success" },
          response: {},
        }),
      });
      await expect(client.getCaptcha()).rejects.toThrow(/no image/i);
    });

    test("fails loudly on an empty body", async () => {
      handlers["/token/getcaptcha"] = () => ({ data: "" });
      await expect(client.getCaptcha()).rejects.toThrow(/no image/i);
    });
  });

  describe("preTokenCheck", () => {
    test("sends application/json AND a LocalName nonce", async () => {
      let seen: any;
      handlers["/token/pretoken-check"] = (c) => {
        seen = c;
        return {
          data: JSON.stringify({
            status: { responseStatus: "Success" },
            response: { random: "RND==", otppwd: "PWD", username: "241B610" },
          }),
        };
      };

      const captcha = { captcha: "d5wh4", hidden: "H==", image: "iVBOR" };
      const result = await client.preTokenCheck({
        username: "241B610",
        usertype: "S",
        captcha,
      });

      expect(result.random).toBe("RND==");
      expect(result.otppwd).toBe("PWD");
      expect(seen.headers["Content-Type"]).toBe("application/json");
      // Both headers are load-bearing. Verified against the live portal:
      // dropping LocalName, or using text/plain, returns 200 with an empty body
      // that is indistinguishable from a wrong captcha.
      expect(seen.headers.LocalName).toBeTruthy();
      const nonce = decrypt(seen.headers.LocalName, deriveKey());
      expect(nonce).toHaveLength(16);
      // No token exists yet, so Authorization must not be sent.
      expect(seen.headers.Authorization).toBeUndefined();
      expect(decodeBody(seen.body)).toEqual({
        username: "241B610",
        usertype: "S",
        captcha,
      });
    });

    test("regenerates LocalName on every captcha submission", async () => {
      const seen: string[] = [];
      handlers["/token/pretoken-check"] = (c) => {
        seen.push(c.headers.LocalName);
        return {
          data: JSON.stringify({
            status: { responseStatus: "Success" },
            response: { random: "R", otppwd: "PWD" },
          }),
        };
      };
      const captcha = { captcha: "x", hidden: "H==", image: "iVBOR" };
      await client.preTokenCheck({ username: "1", usertype: "S", captcha });
      await client.preTokenCheck({ username: "1", usertype: "S", captcha });
      expect(seen[0]).not.toBe(seen[1]);
    });

    test("treats HTTP 200 with an empty body as a captcha rejection", async () => {
      handlers["/token/pretoken-check"] = () => ({ data: "" });
      await expect(
        client.preTokenCheck({
          username: "1",
          usertype: "S",
          captcha: { captcha: "x", hidden: "y", image: "z" },
        })
      ).rejects.toThrow(/rejected the captcha/i);
    });

    test("treats a Success status with no pre-token as a rejection", async () => {
      handlers["/token/pretoken-check"] = () => ({
        data: JSON.stringify({ status: { responseStatus: "Success" }, response: {} }),
      });
      await expect(
        client.preTokenCheck({
          username: "1",
          usertype: "S",
          captcha: { captcha: "x", hidden: "y", image: "z" },
        })
      ).rejects.toThrow(/rejected the captcha/i);
    });
  });

  describe("generateWebToken", () => {
    test("encrypts the payload and parses the nested token response", async () => {
      let seen: any;
      handlers["/token/generatewebtoken"] = (c) => {
        seen = c;
        return {
          data: JSON.stringify({
            status: { responseStatus: "Success" },
            response: {
              regdata: {
                token: "jwt.here.sig",
                clientid: "JAYPEE",
                companyid: "PRID1908A0000001",
                enrollmentno: "241B610",
                membertype: "S",
              },
            },
          }),
        };
      };

      const res = await client.generateWebToken({
        otppwd: "PWD",
        username: "241B610",
        passwordotpvalue: "secret",
        Modulename: "STUDENTMODULE",
        random: "pre-token-value",
      });

      expect(res.response?.regdata?.token).toBe("jwt.here.sig");
      expect(seen.headers["Content-Type"]).toBe("application/json");
      // Step 2 needs LocalName too; omitting it yields an empty 200 body.
      expect(seen.headers.LocalName).toBeTruthy();
      expect(decrypt(seen.headers.LocalName, deriveKey())).toHaveLength(16);
      expect(seen.headers.Authorization).toBeUndefined();
      expect(decodeBody(seen.body)).toMatchObject({
        // otppwd is the login MODE, not the pre-token; random carries the pre-token.
        otppwd: "PWD",
        random: "pre-token-value",
        passwordotpvalue: "secret",
        Modulename: "STUDENTMODULE",
      });
    });

    test("rejects an empty body instead of returning a broken session", async () => {
      handlers["/token/generatewebtoken"] = () => ({ data: "" });
      await expect(
        client.generateWebToken({
          otppwd: "a",
          username: "b",
          passwordotpvalue: "c",
          Modulename: "STUDENTMODULE",
          random: "1",
        })
      ).rejects.toThrow(/rejected the login/i);
    });
  });

  describe("postEncrypted", () => {
    const identity = {
      clientid: "JAYPEE",
      instituteid: "INID2603J000001",
      companyid: "CO1",
      memberid: "M1",
      enrollmentno: "241B610",
      membertype: "S",
      token: "jwt.here.sig",
    };

    test("adds Bearer + LocalName nonce to authenticated requests", async () => {
      let seen: any;
      handlers["/token/getStudentPersonalInformation"] = (c) => {
        seen = c;
        return { data: JSON.stringify({ status: { responseStatus: "Success" } }) };
      };

      await client.postEncrypted(
        "/token/getStudentPersonalInformation",
        { memberid: "M1", companyid: "CO1" },
        identity
      );

      expect(seen.headers.Authorization).toBe("Bearer jwt.here.sig");
      expect(seen.headers["Content-Type"]).toBe("application/json");
      expect(seen.headers.LocalName).toBeTruthy();
      const nonce = decrypt(seen.headers.LocalName, deriveKey());
      expect(nonce).toHaveLength(16);
      expect(nonce.slice(4, 11)).toBe(deriveKey().slice(4, 11));
      expect(decodeBody(seen.body)).toEqual({ memberid: "M1", companyid: "CO1" });
    });

    test("sends ciphertext unquoted, not JSON-stringified", async () => {
      // The portal decrypts the raw body and expects a JSON *object*. If axios
      // serialises the ciphertext to "<ciphertext>" the server either 400s with
      // HttpMessageNotReadableException or answers "Inavlid Input Supplied
      // (@BODY)". Regression guard for the transformRequest override.
      let seen: any;
      handlers["/token/raw"] = (c) => {
        seen = c;
        return { data: JSON.stringify({ status: { responseStatus: "Success" } }) };
      };

      await client.postEncrypted("/token/raw", { instituteid: "INID2603J000001" }, identity);

      expect(typeof seen.body).toBe("string");
      expect(seen.body.startsWith('"')).toBe(false);
      expect(seen.body.endsWith('"')).toBe(false);
      expect(decodeBody(seen.body)).toEqual({ instituteid: "INID2603J000001" });
    });

    test("regenerates LocalName per request", async () => {
      const seen: string[] = [];
      handlers["/token/x"] = (c) => {
        seen.push(c.headers.LocalName);
        return { data: "{}" };
      };
      await client.postEncrypted("/token/x", {}, identity);
      await client.postEncrypted("/token/x", {}, identity);
      expect(seen[0]).not.toBe(seen[1]);
    });

    test("refuses to send without a token", async () => {
      await expect(
        client.postEncrypted("/token/x", {}, { ...identity, token: undefined })
      ).rejects.toThrow(/Missing CampusLynx session token/);
    });

    test("treats an empty authenticated response as an expired session", async () => {
      // The portal answers a dead JWT with HTTP 200 + an empty body. This must
      // be a 401, not a generic 502, or the UI shows a fetch error instead of
      // asking the user to log in again.
      handlers["/token/x"] = () => ({ data: "" });
      await expect(client.postEncrypted("/token/x", {}, identity)).rejects.toMatchObject({
        status: 401,
      });
      await expect(client.postEncrypted("/token/x", {}, identity)).rejects.toThrow(
        /session expired/i
      );
    });
  });

  describe("getEncrypted", () => {
    const identity = {
      clientid: "JAYPEE",
      instituteid: "INID2603J000001",
      companyid: "CO1",
      memberid: "JUET2400386",
      enrollmentno: "241B610",
      membertype: "S",
      token: "jwt.here.sig",
    };

    // Notices/marquee is a GET, but the portal's interceptor still rewrites it,
    // so the authenticated headers must be present on GETs too.
    test("sends Bearer + LocalName on a GET", async () => {
      let seen: any;
      handlers["/token/marqeelist"] = (c) => {
        seen = c;
        return { data: JSON.stringify({ status: { responseStatus: "Success" }, response: { text: "hi" } }) };
      };

      const res: any = await client.getEncrypted("/token/marqeelist", identity);

      expect(res.response.text).toBe("hi");
      expect(seen.headers.Authorization).toBe("Bearer jwt.here.sig");
      expect(decrypt(seen.headers.LocalName, deriveKey())).toHaveLength(16);
      expect(seen.body).toBeUndefined();
    });

    test("refuses to GET without a token", async () => {
      await expect(
        client.getEncrypted("/token/marqeelist", { ...identity, token: undefined })
      ).rejects.toThrow(/Missing CampusLynx session token/);
    });

    test("treats an empty authenticated GET as an expired session, not a 502", async () => {
      // Same signal as postEncrypted: the request carried a Bearer token, so a
      // 200 with an empty body means the JWT is dead. Reporting 502 here would
      // show the user a generic fetch error instead of asking them to log in.
      handlers["/token/marqeelist"] = () => ({ data: "" });
      await expect(client.getEncrypted("/token/marqeelist", identity)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe("refreshToken", () => {
    test("reuses the existing token and returns a new one", async () => {
      let seen: any;
      handlers["/token/refreshTokenRequest"] = (c) => {
        seen = c;
        return {
          data: JSON.stringify({ status: { responseStatus: "Success" }, response: { Token: "jwt.new.sig" } }),
        };
      };

      const res = await client.refreshToken({
        username: "241B610",
        token: "jwt.old.sig",
        otppwd: "PWD",
      });

      expect(res.response?.Token).toBe("jwt.new.sig");
      expect(seen.headers.Authorization).toBe("Bearer jwt.old.sig");
      expect(decodeBody(seen.body)).toMatchObject({
        Token: "jwt.old.sig",
        otppwd: "PWD",
      });
    });

    test("rejects an empty refresh body", async () => {
      handlers["/token/refreshTokenRequest"] = () => ({ data: "" });
      await expect(
        client.refreshToken({ username: "1", token: "t", otppwd: "o" })
      ).rejects.toThrow(/rejected the token refresh/i);
    });
  });

  test("createLocalName output decrypts with the current key", () => {
    const nonce = decrypt(createLocalName(), deriveKey());
    expect(nonce).toHaveLength(16);
  });
});
