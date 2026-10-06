/**
 * Write a fresh captcha PNG for manual reading, then wait.
 *
 *   npx ts-node scripts/fetch-captcha.ts
 *
 * Prints the absolute image path. The operator reads the 5 characters and hands
 * them to scripts/capture-live.ts. Kept separate so the operator has as long as
 * they like -- only step 1 of the portal login (which sends no password) is rate
 * sensitive enough to matter.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { createPortalClient } from "../src/portal/client";

async function main() {
  const client = createPortalClient();
  const captcha = await client.getCaptcha();
  // Unique name per run so a previously read image can never be confused with
  // the one currently on the wire.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = join(__dirname, `captcha-${stamp}.png`);
  writeFileSync(out, Buffer.from(captcha.image, "base64"));
  console.log(out);
  client.destroy();
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
