/**
 * Data/login provider selection.
 *
 * One definition, so the auth routes and the data routes cannot disagree about
 * which backend is live. `DATA_PROVIDER` is a deploy-time switch: it is read
 * when routes are registered (server boot) and never mutated afterwards.
 *
 *   campuslynx (default) CampusLynx portal JSON API
 *   webkiosk             legacy scraped WebKiosk flow (fallback)
 */

export type DataProvider = "webkiosk" | "campuslynx";

const PROVIDERS: readonly DataProvider[] = ["webkiosk", "campuslynx"];

export function resolveProvider(raw: string | undefined = process.env.DATA_PROVIDER): DataProvider {
  return (raw || "campuslynx") as DataProvider;
}

/** True when the CampusLynx portal is the active provider. */
export function isCampusLynxProvider(): boolean {
  return resolveProvider() === "campuslynx";
}

/**
 * Fail fast on a typo'd provider at boot rather than silently running the wrong
 * backend -- `DATA_PROVIDER=campuslnyx` should not quietly serve WebKiosk.
 */
export function assertKnownProvider(raw: string | undefined = process.env.DATA_PROVIDER): DataProvider {
  const provider = resolveProvider(raw);
  if (!PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown DATA_PROVIDER "${raw}". Expected one of: ${PROVIDERS.join(", ")}.`
    );
  }
  return provider;
}
