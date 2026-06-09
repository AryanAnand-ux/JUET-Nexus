# Persistent Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Option 1 (auto-relogin via secure, encrypted credentials stored in client-side cookies) so that a user remains logged in even after their WebKiosk session times out.

**Architecture:** 
1. Modify cookie encryption to store a full JSON payload (`jsessionid`, `enrollment`, `password`, `dob`, `role`) instead of just a string `jsessionid`.
2. Implement a reusable session manager `getValidSession(request, reply)` that intercepts protected route handlers.
3. If the active `jsessionid` has expired, the session manager silently fetches the WebKiosk login page, auto-solves the captcha via the existing `.noselect` parser, posts login, verifies the new session, updates the cookie via `reply.setCookie`, and returns the new session ID to fulfill the scraping request.

**Tech Stack:** Node.js, Fastify, TypeScript, Axios, JSDOM, Jest.

---

### Task 1: Update Encryption Utility
Extend the encryption utility to support serializing, encrypting, decrypting, and parsing the new `SessionData` payload while maintaining fallback compatibility for legacy cookies.

**Files:**
- Modify: `backend/src/utils/encryption.ts`
- Modify: `backend/tests/encryption.test.ts`

- [ ] **Step 1: Update `backend/src/utils/encryption.ts`**
  Add the `SessionData` type, update imports, and implement the helpers.
  ```typescript
  import { AuthPayload } from '../../../shared/types';

  export interface SessionData {
    jsessionid: string;
    enrollment: string;
    password: string;
    dob: string;
    role: AuthPayload["role"];
  }

  export function encryptSessionData(data: SessionData): string {
    return encryptSession(JSON.stringify(data));
  }

  export function decryptSessionData(token: string): SessionData {
    const decrypted = decryptSession(token);
    try {
      return JSON.parse(decrypted) as SessionData;
    } catch {
      // Return a partial SessionData object to maintain backward compatibility with legacy token format
      return {
        jsessionid: decrypted,
        enrollment: "",
        password: "",
        dob: "",
        role: "Student",
      };
    }
  }
  ```

- [ ] **Step 2: Add Jest unit tests in `backend/tests/encryption.test.ts`**
  ```typescript
  import { encryptSessionData, decryptSessionData, SessionData } from "../src/utils/encryption";

  describe("encryptSessionData & decryptSessionData", () => {
    const sampleData: SessionData = {
      jsessionid: "1234567890ABCDEF1234567890ABCDEF",
      enrollment: "201B001",
      password: "SuperSecretPassword123",
      dob: "01-01-2002",
      role: "Student"
    };

    it("should encrypt and decrypt SessionData correctly", () => {
      const encrypted = encryptSessionData(sampleData);
      const decrypted = decryptSessionData(encrypted);
      expect(decrypted).toEqual(sampleData);
    });

    it("should fallback gracefully if decrypting a legacy plain string", () => {
      const plainId = "LEGACY_SESSION_ID_12345";
      const encrypted = encryptSession(plainId);
      const decrypted = decryptSessionData(encrypted);
      expect(decrypted.jsessionid).toBe(plainId);
      expect(decrypted.enrollment).toBe("");
    });
  });
  ```

- [ ] **Step 3: Run Jest tests to verify encryption**
  Run: `npm test tests/encryption.test.ts`
  Expected output: `PASS tests/encryption.test.ts`

- [ ] **Step 4: Commit**
  ```bash
  git add backend/src/utils/encryption.ts backend/tests/encryption.test.ts
  git commit -m "feat: add SessionData encryption helpers with legacy fallback"
  ```

---

### Task 2: Update Auth Login Handler
Modify the initial authentication endpoint to serialize and encrypt the full credentials object into the `auth` cookie.

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Modify `authHandler` in `backend/src/routes/auth.ts`**
  Find the successful authentication block (around lines 270-286) and replace `encryptSession(jsessionid)` with `encryptSessionData(sessionData)`.
  
  Code replacement:
  ```typescript
  // Find:
  // const encryptedSession = encryptSession(jsessionid);
  // Replace with:
  import { encryptSessionData, SessionData } from "../utils/encryption";

  const sessionData: SessionData = {
    jsessionid,
    enrollment: enrollment.toUpperCase(),
    password,
    dob,
    role,
  };
  const encryptedSession = encryptSessionData(sessionData);
  ```

- [ ] **Step 2: Compile backend locally to verify no compilation errors**
  Run: `npm run build`
  Expected: Command finishes successfully with no TypeScript compilation errors.

- [ ] **Step 3: Commit**
  ```bash
  git add backend/src/routes/auth.ts
  git commit -m "feat: store full credentials payload in auth cookie on successful login"
  ```

---

### Task 3: Implement Re-Authentication Session Manager
Create the validation helper `getValidSession` that detects session expiration, performs background re-authentication to WebKiosk using cached/cookie credentials, and updates the HTTP response cookie header.

**Files:**
- Create: `backend/src/routes/session.ts`

- [ ] **Step 1: Write `backend/src/routes/session.ts`**
  Implement the logic for fetching captcha, posting login request to WebKiosk, checking validation, and updating cookies.
  
  ```typescript
  import { FastifyRequest, FastifyReply } from "fastify";
  import axios from "axios";
  import { decryptSessionData, encryptSessionData, SessionData } from "../utils/encryption";
  import { parseCaptchaImage, extractJSessionId } from "../parsers/auth";

  const WEBKIOSK_BASE_URL = process.env.WEBKIOSK_BASE_URL || "https://webkiosk.juet.ac.in";
  const WEBKIOSK_LOGIN_PAGE = "/CommonFiles/Userlogin.jsp";
  const WEBKIOSK_AUTH_ACTION = "/CommonFiles/UserLoginAction.jsp";
  const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "15000", 10);

  const VERIFY_URLS: Record<string, string> = {
    S: "/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp",
    E: "/EmployeeFiles/PersonalFiles/ShowAlertMessageEMP.jsp",
  };

  function roleToWebKioskCode(role: string): string {
    if (role === "Student") return "S";
    if (role === "Employee") return "E";
    return "G";
  }

  async function verifyWebKioskSession(jsessionid: string, roleCode: string): Promise<boolean> {
    const verifyPath = VERIFY_URLS[roleCode] || VERIFY_URLS["S"];
    const verifyUrl = new URL(verifyPath, WEBKIOSK_BASE_URL).toString();
    try {
      const response = await axios.get(verifyUrl, {
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          Cookie: `JSESSIONID=${jsessionid}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const verifyBody = typeof response.data === "string" ? response.data : "";
      const verifyLower = verifyBody.toLowerCase();
      const isInvalid =
        verifyLower.includes("session timeout") ||
        verifyLower.includes("please login") ||
        verifyLower.includes("please <a") ||
        verifyBody.length < 200;
      return !isInvalid;
    } catch {
      return false;
    }
  }

  export async function getValidSession(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<string> {
    const logger = request.server.log;
    const encryptedSession = request.cookies.auth;

    if (!encryptedSession) {
      throw { statusCode: 401, message: "Not authenticated", code: "NO_SESSION" };
    }

    let session: SessionData;
    try {
      session = decryptSessionData(encryptedSession);
    } catch (err) {
      logger.warn(err, "[Session] Decryption failed");
      throw { statusCode: 401, message: "Unauthorized: Invalid session", code: "INVALID_SESSION" };
    }

    const roleCode = roleToWebKioskCode(session.role);

    // 1. Verify if current jsessionid is active
    const isValid = await verifyWebKioskSession(session.jsessionid, roleCode);
    if (isValid) {
      return session.jsessionid;
    }

    // 2. If session has expired and we don't have saved credentials (legacy fallback)
    if (!session.enrollment || !session.password) {
      logger.warn(`Session expired for enrollment ${session.enrollment} with no credentials saved`);
      throw { statusCode: 401, message: "Session expired. Please log in again.", code: "SESSION_EXPIRED" };
    }

    logger.info(`Session expired. Performing silent re-login for enrollment: ${session.enrollment}`);

    try {
      // 3. Request login page to obtain new JSESSIONID and captcha
      const initResp = await axios.get(`${WEBKIOSK_BASE_URL}${WEBKIOSK_LOGIN_PAGE}`, {
        timeout: REQUEST_TIMEOUT,
      });
      const cookies = initResp.headers["set-cookie"] || [];
      const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
      const jsessionidInit = extractJSessionId(cookieHeader);

      if (!jsessionidInit) {
        throw new Error("Could not extract initial JSESSIONID for re-login");
      }

      // 4. Auto-solve captcha using .noselect parser
      const parsedCaptcha = await parseCaptchaImage(
        typeof initResp.data === "string" ? initResp.data : "",
        WEBKIOSK_BASE_URL,
        cookieHeader,
        REQUEST_TIMEOUT
      );

      if (!parsedCaptcha.captchaValue) {
        throw new Error("Re-login failed: Captcha could not be auto-solved.");
      }

      // 5. POST credentials
      const form = new URLSearchParams({
        InstCode: "JUET",
        UserType: roleCode,
        MemberCode: session.enrollment,
        DATE1: session.dob,
        Password: session.password,
        txtcap: parsedCaptcha.captchaValue,
        BTNSubmit: "Submit",
      });

      const authResp = await axios.post(
        new URL("/CommonFiles/UserLoginAction.jsp", WEBKIOSK_BASE_URL).toString(),
        form.toString(),
        {
          timeout: REQUEST_TIMEOUT,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      // 6. Get new JSESSIONID
      const setCookieHeaders = authResp.headers["set-cookie"] || [];
      const newCookieStr = (
        Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
      )
        .map((c: string) => c.split(";")[0])
        .join("; ");

      const newJSessionId = extractJSessionId(newCookieStr) || jsessionidInit;

      // 7. Verify new session
      const verifySuccess = await verifyWebKioskSession(newJSessionId, roleCode);
      if (!verifySuccess) {
        throw new Error("Failed to verify newly generated re-login session");
      }

      logger.info(`Silent re-login successful for enrollment: ${session.enrollment}`);

      // 8. Update session object and issue new cookie
      const updatedSession: SessionData = {
        ...session,
        jsessionid: newJSessionId,
      };

      const encryptedUpdatedSession = encryptSessionData(updatedSession);
      const isProduction = process.env.NODE_ENV === "production";
      reply.setCookie("auth", encryptedUpdatedSession, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60, // Extend cookie life to 30 days
        path: "/",
      });

      return newJSessionId;
    } catch (error: any) {
      logger.error(`Silent re-login failed: ${error.message}`);
      // Clear cookie to force clean login screen redirect on client
      reply.clearCookie("auth", { path: "/" });
      throw { statusCode: 401, message: "Session expired. Please log in again.", code: "SESSION_EXPIRED" };
    }
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add backend/src/routes/session.ts
  git commit -m "feat: implement getValidSession re-authentication session manager"
  ```

---

### Task 4: Integrate Session Manager into Protected Routes
Integrate `getValidSession` into dashboard and attendance routes to replace legacy cookie extraction.

**Files:**
- Modify: `backend/src/routes/attendance.ts`
- Modify: `backend/src/routes/dashboard.ts`

- [ ] **Step 1: Modify `backend/src/routes/attendance.ts`**
  Replace lines 17-37 in `registerAttendanceRoutes` with `getValidSession`.
  
  Before:
  ```typescript
        const encryptedSession = request.cookies.auth;

        if (!encryptedSession) {
          return reply.status(401).send({
            success: false,
            error: 'Not authenticated',
            code: 'NO_SESSION',
          });
        }

        let jsessionid: string;
        try {
          jsessionid = decryptSession(encryptedSession);
        } catch (error) {
          ...
        }
  ```

  After:
  ```typescript
        import { getValidSession } from './session';

        let jsessionid: string;
        try {
          jsessionid = await getValidSession(request, reply);
        } catch (err: any) {
          return reply.status(err.statusCode || 401).send({
            success: false,
            error: err.message || 'Unauthorized',
            code: err.code || 'UNAUTHORIZED',
          });
        }
  ```

- [ ] **Step 2: Modify `backend/src/routes/dashboard.ts`**
  Update the endpoints in `registerDashboardRoutes` where `request.cookies.auth` was fetched.
  Find occurrences (lines 80-99, 272-276, 346-359) and replace them.

  Example Replacement for lines 80-98:
  ```typescript
  // Before:
  const encryptedSession = request.cookies.auth;
  // ... check, decryptSession ...

  // After:
  import { getValidSession } from './session';
  
  let jsessionid: string;
  try {
    jsessionid = await getValidSession(request, reply);
  } catch (err: any) {
    return reply.status(err.statusCode || 401).send({
      error: err.message || 'Unauthorized',
      code: err.code || 'UNAUTHORIZED',
    });
  }
  ```

- [ ] **Step 3: Compile backend code to verify TS compilation**
  Run: `npm run build`
  Expected: Build succeeds with zero errors.

- [ ] **Step 4: Run backend Jest unit tests to verify no regressions**
  Run: `npm test`
  Expected: 52/52 tests pass successfully.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/routes/attendance.ts backend/src/routes/dashboard.ts
  git commit -m "feat: integrate getValidSession into attendance and dashboard routes"
  ```
