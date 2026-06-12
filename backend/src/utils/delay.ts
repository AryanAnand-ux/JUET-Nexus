/**
 * Resolves a promise after a given number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a promise-returning function with a random delay (jitter) to mimic human behavior.
 *
 * @param fn The function returning a promise to execute.
 * @param minMs Minimum delay in milliseconds.
 * @param maxMs Maximum delay in milliseconds.
 */
export async function withJitter<T>(
  fn: () => Promise<T>,
  minMs = 100,
  maxMs = 500
): Promise<T> {
  const delayTime = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delayTime);
  return fn();
}
