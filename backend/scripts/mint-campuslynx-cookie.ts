/**
 * Ad-hoc: mint an `auth` cookie carrying a CampusLynx identity so the
 * `/api/attendance/details` branch can be exercised without a live login.
 *
 * The token below is a placeholder, so a real portal call will be rejected
 * with 401 -- which is exactly what we want to verify (error mapping).
 *
 * Usage: npx ts-node scripts/mint-campuslynx-cookie.ts [portal|expired]
 */
import "dotenv/config";
import { encryptSessionData, SessionData } from "../src/utils/encryption";

const mode = process.argv[2] ?? "expired";

const session: SessionData = {
  jsessionid: "",
  enrollment: "241B610",
  password: "",
  dob: "01-01-2005",
  role: "Student",
  campusLynx: {
    clientid: "JAYPEE",
    instituteid: "INID2603J000001",
    companyid: "CO1",
    memberid: "JUET2400386",
    enrollmentno: "241B610",
    membertype: "S",
    token: mode === "expired" ? "not.a.real.token" : "also.not.real",
    username: "241B610",
    otppwd: "PWD",
  },
};

process.stdout.write(encryptSessionData(session));
