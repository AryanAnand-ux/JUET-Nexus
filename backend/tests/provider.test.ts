/**
 * `DATA_PROVIDER` resolution.
 *
 * The auth routes snapshot the provider when they are registered; the data
 * routes consult it per request. Both go through this module so a typo cannot
 * leave the two disagreeing about which backend is live.
 */

import {
  resolveProvider,
  isCampusLynxProvider,
  assertKnownProvider,
} from "../src/utils/provider";

describe("provider selection", () => {
  const original = process.env.DATA_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.DATA_PROVIDER;
    else process.env.DATA_PROVIDER = original;
  });

  test("defaults to campuslynx when unset", () => {
    delete process.env.DATA_PROVIDER;
    expect(resolveProvider()).toBe("campuslynx");
    expect(isCampusLynxProvider()).toBe(true);
  });

  test("selects campuslynx explicitly", () => {
    process.env.DATA_PROVIDER = "campuslynx";
    expect(isCampusLynxProvider()).toBe(true);
  });

  test("rejects unknown provider at boot", () => {
    process.env.DATA_PROVIDER = "unknown_provider";
    expect(() => assertKnownProvider()).toThrow(/Unknown DATA_PROVIDER/);
  });

  test("accepts known provider", () => {
    expect(assertKnownProvider("campuslynx")).toBe("campuslynx");
    expect(assertKnownProvider(undefined)).toBe("campuslynx");
  });
});
