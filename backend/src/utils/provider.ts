/**
 * Data/login provider selection.
 *
 * CampusLynx (studentportal.juet.ac.in) is the sole student portal backend.
 */

export type DataProvider = "campuslynx";

const PROVIDERS: readonly DataProvider[] = ["campuslynx"];

export function resolveProvider(raw: string | undefined = process.env.DATA_PROVIDER): DataProvider {
  return (raw || "campuslynx") as DataProvider;
}

/**
 * Fail fast on a typo'd provider at boot rather than silently running an unknown configuration.
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
