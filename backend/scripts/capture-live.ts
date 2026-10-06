/**
 * Interactive two-step CampusLynx login, then capture every data endpoint.
 *
 *   $env:NODE_OPTIONS="--use-system-ca"   # required when TLS is intercepted
 *   npx ts-node scripts/capture-live.ts <enrollment>
 *
 * Mirrors the portal's own two-page flow:
 *   step 1  #/          user id + captcha   -> /token/pretoken-check
 *   step 2  #/pwdlogin  password            -> /token/generatewebtoken
 *
 * Endpoint paths and payload shapes are read from the portal's Angular bundle,
 * not guessed. Several are non-obvious and cost real debugging time:
 *   - the session token lives at response.regdata.token (not response.Token)
 *   - instituteid comes from regdata.institutelist[0].value
 *   - every request needs Content-Type: application/json AND a LocalName nonce
 *   - the ciphertext body must NOT be JSON-quoted by axios
 *   - getallsemesterdata keys the current semester as `stynumber`, not
 *     `currentsem`
 *   - cmpidkey is an array of { subjectcomponentid } built by splitting a
 *     comma-separated string
 *   - getmenulist wants `bypassValue` as AES ciphertext of regdata.bypass
 *
 * Credentials are never taken from argv, never logged, and never written to a
 * fixture. Captured fixtures have token-shaped fields stripped.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import * as readline from "readline";
import { createPortalClient } from "../src/portal/client";
import { encrypt } from "../src/portal/crypto";
import { STUDENT_MODULE } from "../src/portal/types";
import type { PortalIdentity, PortalRegData } from "../src/portal/types";

const ENROLLMENT = process.argv[2] || process.env.PORTAL_USER || "";
const OUT_DIR = join(__dirname, "..", "tests", "fixtures");

if (!ENROLLMENT) {
  console.error("usage: npx ts-node scripts/capture-live.ts <enrollment>");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Read a secret with echo suppressed. Reports the captured LENGTH, never the
 * value, so a mangled read stays distinguishable from a rejected password. The
 * portal answers both cases with 200 and an empty body, so without this the
 * two are indistinguishable.
 */
function askSecret(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return ask(question).then((value) => {
      process.stdout.write(`(${value.length} chars captured)\n`);
      return value;
    });
  }

  return new Promise((resolve) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    process.stdout.write(question);

    const finish = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(!!wasRaw);
      stdin.pause();
      process.stdout.write(`(${value.length} chars captured)\n`);
      resolve(value);
    };

    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") return finish();
        if (code === 3) {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (code === 8 || code === 127) {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (code < 32) continue;
        value += ch;
        process.stdout.write("*");
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function save(name: string, value: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(value, null, 2));
}

/**
 * Strip anything token-shaped before writing a fixture to the repo. A committed
 * JWT would be a live credential for the portal session.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(token|tokendate|jwt|password|passwordotpvalue)$/i.test(k)) {
        out[k] = "<redacted>";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

interface PortalResult {
  status?: { responseStatus?: string; errors?: unknown };
  response?: Record<string, unknown>;
  [key: string]: unknown;
}

async function main() {
  const client = createPortalClient();

  // ---- Step 1: user id + captcha (served at #/) ---------------------------
  const captcha = await client.getCaptcha();

  // Unique per-run filename: reusing a fixed name lets a stale image be read
  // while a newer captcha is validated, which always fails.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const captchaPath = join(__dirname, `captcha-${stamp}.png`);
  writeFileSync(captchaPath, Buffer.from(captcha.image, "base64"));

  console.log("\nRead THIS exact file (it is unique to this run):");
  console.log(`  ${captchaPath}`);
  console.log("5 characters, lowercase letters/digits.");

  const answer = await ask("captcha > ");
  if (!answer) {
    console.error("No captcha answer given.");
    process.exit(1);
  }

  const preToken = await client.preTokenCheck({
    username: ENROLLMENT,
    usertype: "S",
    captcha: { ...captcha, captcha: answer },
  });
  console.log(`step 1 ok: otppwd=${preToken.otppwd} (login mode)`);

  if (preToken.otppwd !== "PWD") {
    console.error(
      `Portal asked for "${preToken.otppwd}" instead of a password; OTP login is not implemented yet.`
    );
    process.exit(1);
  }

  // ---- Step 2: password (served at #/pwdlogin) ----------------------------
  const password = await askSecret("password > ");
  const login = await client.generateWebToken({
    otppwd: preToken.otppwd,
    username: ENROLLMENT,
    passwordotpvalue: password,
    Modulename: STUDENT_MODULE,
    random: preToken.random,
  });

  const regdata: PortalRegData = login.response?.regdata || {};
  const token = String(regdata.token || "");
  if (!token) {
    console.error("Login returned no token:", JSON.stringify(redact(login), null, 2));
    process.exit(1);
  }
  console.log("step 2 ok: session token received");

  // The portal picks instituteid out of institutelist[0], not regdata.instituteid.
  const instituteList = Array.isArray(regdata.institutelist) ? regdata.institutelist : [];
  const firstInstitute = (instituteList[0] || {}) as Record<string, unknown>;
  const instituteid = String(firstInstitute.value || regdata.instituteid || "");

  const identity: PortalIdentity = {
    clientid: String(regdata.clientid || "JAYPEE"),
    instituteid,
    companyid: String(regdata.companyid || ""),
    memberid: String(regdata.memberid || regdata.membertype || ""),
    enrollmentno: String(regdata.enrollmentno || ENROLLMENT),
    membertype: String(regdata.membertype || "S"),
    token,
  };

  console.log("regdata:", JSON.stringify(redact(regdata), null, 2));
  if (!instituteid) {
    console.error("WARNING: no instituteid in the login response; data calls will likely fail.");
  }

  save("10-session", { identity: { ...identity, token: "<redacted>" }, regdata: redact(regdata) });

  // ---- Data capture -------------------------------------------------------
  // The portal's screens are chained, so this walks them in UI order. Payload
  // shapes come from the bundle's call sites:
  //
  //   getstudent-personalinformation      { instituteid }
  //   studentsgpacgpa/loadData            { instituteid }        -> stynumber, studentid
  //   getsemestercode-exammarks           { instituteid }        -> registrations
  //   checkIfstudentmasterexist           { instituteid, studentid, name, enrollmentno }
  //                                                            -> currentsemester
  //   getallsemesterdata                  { instituteid, studentid, stynumber }
  //   getallsemesterdatadetail            { instituteid, studentid, stynumber }
  //   getstudentInforegistrationforattend { instituteid }
  //   getstudentattendancedetail          { instituteid, stynumber, registrationid,
  //                                        registrationcode }
  //   getstudentsubjectpersentage         { instituteid, subjectid, registrationid,
  //                                        cmpidkey, subjectcode, registrationcode }
  //   getstudent-exammarks                { instituteid, registrationid, companyid }
  //   getmenulist                         { clientid, instituteid, membertype, bypassValue }

  interface Call {
    name: string;
    endpoint: string;
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
  }

  async function call(job: Call): Promise<PortalResult> {
    await sleep(600);
    try {
      const result =
        job.method === "GET"
          ? ((await client.getEncrypted(job.endpoint, identity)) as PortalResult)
          : ((await client.postEncrypted(job.endpoint, job.body || {}, identity)) as PortalResult);
      const status = result?.status?.responseStatus;
      const keys = result?.response ? Object.keys(result.response) : [];
      const ok = status === "Success" && keys.length > 0;
      console.log(
        `[${job.name}] ${ok ? "Success" : `no data (${status || "empty body"})`}${
          keys.length ? " keys=" + keys.slice(0, 12).join(",") : ""
        }`
      );
      save(job.name, redact(result));
      return result;
    } catch (error: any) {
      console.log(`[${job.name}] FAILED: ${error.message}`);
      save(job.name, { error: error.message });
      return {};
    }
  }

  const field = (r: PortalResult | undefined, ...path: string[]): any => {
    let cur: any = r?.response;
    for (const p of path) cur = cur?.[p];
    return cur;
  };

  const list = (value: any): any[] => (Array.isArray(value) ? value : []);
  const okResult = (r: PortalResult | undefined) =>
    !!r && r.status?.responseStatus === "Success" && Object.keys(r.response || {}).length > 0;

  console.log("\n=== data capture ===");

  const studentName = String(regdata.name || "");
  const enrollmentno = String(regdata.enrollmentno || ENROLLMENT);
  // The portal stores bypassValue as encryptUsingAES256(regdata.bypass), i.e.
  // the ciphertext of that bare string -- not the plaintext "N".
  const bypassValue = encrypt(String(regdata.bypass ?? ""));

  // ---- Seed endpoints: every later call depends on these -------------------
  const profile = await call({
    name: "11-profile",
    endpoint: "/studentpersinfo/getstudent-personalinformation",
    body: { instituteid },
  });
  if (!okResult(profile)) {
    // A second caller in the bundle sends clientid alongside instituteid.
    await call({
      name: "11b-profile",
      endpoint: "/studentpersinfo/getstudent-personalinformation",
      body: { instituteid, clientid: identity.clientid },
    });
  }

  const sgpa = await call({
    name: "13-sgpa-loadData",
    endpoint: "/studentsgpacgpa/loadData",
    body: { instituteid },
  });

  const semcodes = await call({
    name: "12-semester-codes",
    endpoint: "/studentcommonsontroller/getsemestercode-exammarks",
    body: { instituteid },
  });

  const studentInfo = list(field(sgpa, "studentInfo"))[0] || {};
  const stynumber = String(studentInfo.stynumber ?? "");
  const studentid = String(studentInfo.studentid || regdata.memberid || "");
  console.log(`  -> stynumber=${stynumber || "?"} studentid=${studentid || "?"}`);

  // ---- SGPA ---------------------------------------------------------------
  const master = await call({
    name: "14-sgpa-master",
    endpoint: "/studentsgpacgpa/checkIfstudentmasterexist",
    body: { instituteid, studentid, name: studentName, enrollmentno },
  });

  const currentsem = String(field(master, "studentlov", "currentsemester") ?? "");
  console.log(`  -> currentsemester=${currentsem || "?"}`);

  // The key here is `stynumber`, NOT `currentsem`: the portal keeps the current
  // semester in a form control named currentsem but serialises it as stynumber.
  // Sending `currentsem` returns an empty body.
  const semesters = await call({
    name: "15-sgpa-allsemesterdata",
    endpoint: "/studentsgpacgpa/getallsemesterdata",
    body: { instituteid, studentid, stynumber: currentsem },
  });

  // Per-semester detail takes a stynumber picked out of the list returned
  // above. If that list is empty, sweep the plausible range so a single run
  // still yields CGPA fixtures.
  const semesterList = list(field(semesters, "semesterList"));
  const stynumbers = semesterList.length
    ? semesterList.map((s) => String(s.stynumber ?? "")).filter(Boolean)
    : Array.from({ length: 8 }, (_, i) => String(i + 1));
  console.log(`  -> semesters to detail: ${stynumbers.join(",") || "none"}`);

  for (const [index, sem] of stynumbers.slice(0, 8).entries()) {
    await call({
      name: `16-sgpa-semesterdetail-${index + 1}`,
      endpoint: "/studentsgpacgpa/getallsemesterdatadetail",
      body: { instituteid, studentid, stynumber: sem },
    });
  }

  // ---- Attendance ---------------------------------------------------------
  const attendanceRegs = await call({
    name: "17-attendance-registration",
    endpoint: "/StudentClassAttendance/getstudentInforegistrationforattendence",
    body: { instituteid },
  });
  if (!okResult(attendanceRegs)) {
    await call({
      name: "17b-attendance-registration",
      endpoint: "/StudentClassAttendance/getstudentInforegistrationforattendence",
      body: { instituteid, studentid, stynumber },
    });
  }

  const registrations = list(field(semcodes, "semestercode")).filter(
    (r) => r && (r.registrationid || r.registrationcode)
  );
  console.log(`  -> ${registrations.length} registration(s)`);

  const labelled = new Set<string>();

  for (const [index, reg] of registrations.slice(0, 3).entries()) {
    const registrationid = String(reg.registrationid || "");
    const registrationcode = String(reg.registrationcode || "");

    const detail = await call({
      name: `18-attendance-detail-${index + 1}`,
      endpoint: "/StudentClassAttendance/getstudentattendancedetail",
      body: { instituteid, stynumber, registrationid, registrationcode },
    });

    await call({
      name: `19-marks-${index + 1}`,
      endpoint: "/studentsexamview/getstudent-exammarks",
      body: { instituteid, registrationid, companyid: identity.companyid },
    });

    // Subject-wise attendance: cmpidkey selects which component column was
    // clicked in the grid (lecture / tutorial / practical).
    const subjects = list(field(detail, "studentattendancelist"));
    for (const subject of subjects) {
      for (const key of ["Lsubjectcomponentid", "Tsubjectcomponentid", "Psubjectcomponentid"]) {
        const raw = subject[key];
        if (!raw) continue;
        const cmpidkey = String(raw)
          .split(",")
          .filter(Boolean)
          .map((subjectcomponentid) => ({ subjectcomponentid }));
        const label = `${key.charAt(0)}${index + 1}-${subject.subjectid ?? "x"}`;
        if (labelled.has(label)) continue;
        labelled.add(label);
        await call({
          name: `20-attendance-percentage-${label}`,
          endpoint: "/StudentClassAttendance/getstudentsubjectpersentage",
          body: {
            instituteid,
            subjectid: subject.subjectid,
            registrationid,
            cmpidkey,
            subjectcode: subject.individualsubjectcode,
            registrationcode,
          },
        });
      }
    }
  }

  // ---- Incidental ---------------------------------------------------------
  await call({
    name: "21-navigation",
    endpoint: "/clxuser/getmenulist",
    body: {
      clientid: identity.clientid,
      instituteid,
      membertype: identity.membertype,
      bypassValue,
    },
  });
  await call({ name: "22-notices", endpoint: "/token/marqeelist", method: "GET" });

  console.log(`\nFixtures written to ${OUT_DIR}`);
  client.destroy();
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
