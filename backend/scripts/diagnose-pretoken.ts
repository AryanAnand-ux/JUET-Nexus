/**
 * Test the exact header set the portal's own HTTP interceptor puts on an
 * unauthenticated request.
 *
 *   $env:NODE_OPTIONS="--use-system-ca"
 *   npx ts-node scripts/diagnose-pretoken.ts <enrollment>
 *
 * Finding that motivates this: the login page sets `localStorage.Token = ""` and
 * the interceptor guard is `null !== Token`, which is TRUE for an empty string.
 * So the browser attaches, even before login:
 *
 *   Content-Type: application/json
 *   Authorization: Bearer            <- empty token
 *   LocalName:     <encrypted nonce>
 *
 * to /token/getcaptcha and /token/pretoken-check alike. Earlier variants here
 * omitted Authorization/LocalName, which is why they all came back empty.
 *
 * Fetches ONE captcha, prompts for the answer, then replays variants against it.
 * Step 1 sends no password, so replaying is safe.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";
import axios from "axios";
import https from "https";
import { encryptBody, createLocalName, dateCore, deriveKey } from "../src/portal/crypto";
import type { PortalCaptcha } from "../src/portal/types";

const ENROLLMENT = process.argv[2];

if (!ENROLLMENT) {
  console.error("usage: npx ts-node scripts/diagnose-pretoken.ts <enrollment>");
  process.exit(1);
}

const BASE =
  process.env.PORTAL_BASE_URL ||
  "https://studentportal.juet.ac.in/StudentPortalAPI";
const SPA = "https://studentportal.juet.ac.in/studentportal/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function getCaptcha(): Promise<PortalCaptcha> {
  const res = await axios.get(`${BASE}/token/getcaptcha`, {
    timeout: 30000,
    responseType: "text",
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer ",
      LocalName: createLocalName(),
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
    },
    httpsAgent: agent,
  });
  return JSON.parse(res.data).response.captcha;
}

interface Variant {
  name: string;
  headers: () => Record<string, string>;
}

async function main() {
  console.log(`local time : ${new Date().toString()}`);
  console.log(`cipher key : ${deriveKey()} (dateCore ${dateCore()})\n`);

  const captcha = await getCaptcha();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(__dirname, `captcha-${stamp}.png`);
  writeFileSync(path, Buffer.from(captcha.image, "base64"));
  console.log(`Read this file: ${path}`);
  console.log(`hidden=${captcha.hidden}`);

  const answer = await ask("captcha > ");
  if (!answer) {
    console.error("no answer given");
    process.exit(1);
  }
  console.log(`\nsubmitting "${answer}"\n`);

  const browserish = {
    Origin: "https://studentportal.juet.ac.in",
    Referer: SPA,
    Accept: "application/json, text/plain, */*",
    "User-Agent": UA,
  };

  const variants: Variant[] = [
    {
      name: "F application/json + empty Bearer + LocalName  (interceptor-exact)",
      headers: () => ({
        ...browserish,
        "Content-Type": "application/json",
        Authorization: "Bearer ",
        LocalName: createLocalName(),
      }),
    },
    {
      name: "G application/json + LocalName (no Authorization)",
      headers: () => ({
        ...browserish,
        "Content-Type": "application/json",
        LocalName: createLocalName(),
      }),
    },
    {
      name: "H application/json only (no auth headers at all)",
      headers: () => ({ ...browserish, "Content-Type": "application/json" }),
    },
    {
      name: "I interceptor-exact, no Origin/Referer",
      headers: () => ({
        "Content-Type": "application/json",
        Authorization: "Bearer ",
        LocalName: createLocalName(),
        Accept: "application/json, text/plain, */*",
        "User-Agent": UA,
      }),
    },
  ];

  const accepted: string[] = [];

  for (const variant of variants) {
    const payload = {
      username: ENROLLMENT,
      usertype: "S",
      captcha: { captcha: answer, hidden: captcha.hidden, image: captcha.image },
    };

    try {
      const res = await axios.post(`${BASE}/token/pretoken-check`, encryptBody(payload), {
        timeout: 30000,
        responseType: "text",
        validateStatus: () => true,
        headers: variant.headers(),
        httpsAgent: agent,
      });
      const text = typeof res.data === "string" ? res.data : "";
      console.log(`--- ${variant.name}`);
      console.log(
        `    http=${res.status} bytes=${text.length} ct=${res.headers["content-type"] || "(none)"}`
      );
      console.log(`    body: ${text.trim() ? text.slice(0, 260) : "(empty)"}`);
      if (text.trim()) accepted.push(variant.name);
    } catch (error: any) {
      console.log(`--- ${variant.name} ERROR ${error.message}`);
    }
  }

  console.log("");
  if (accepted.length) {
    console.log(`ACCEPTED by: ${accepted.join(", ")}`);
  } else {
    console.log("Still empty on every variant.");
  }
  agent.destroy();
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
