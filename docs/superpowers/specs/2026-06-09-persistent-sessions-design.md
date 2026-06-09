# Spec: Persistent Sessions (Auto-Re-login)

## 1. Goal & Context
The goal of this enhancement is to allow JUET Nexus users to stay logged in until they explicitly click the "Logout" button. 

Currently, the portal proxies requests to the JUET WebKiosk ERP system using a browser session token (`JSESSIONID`) encrypted in an `auth` cookie. However, WebKiosk automatically terminates sessions after 20–30 minutes of inactivity. When this occurs, any subsequent query to the proxy yields a `401 Unauthorized` response, triggering a client-side logout.

To bypass this restriction while maintaining a stateless backend architecture, we will store the student's encrypted WebKiosk credentials inside the secure, HTTP-only cookie. If the session expires, the backend will decrypt the credentials, perform a silent background authentication to WebKiosk, refresh the cookie, and proceed with the student's request seamlessly.

---

## 2. Component Design & Changes

### A. Session Data Contract
We define a new type structure for the cookie payload:

```typescript
export interface SessionData {
  jsessionid: string;
  enrollment: string;
  password: string;
  dob: string; // Format: DD-MM-YYYY
  role: 'Student' | 'Employee' | 'Guest';
}
```

### B. Utility Modifications (`backend/src/utils/encryption.ts`)
We will add two new functions to handle objects rather than plain strings, ensuring robust JSON parsing and error handling:
*   `encryptSessionData(data: SessionData): string`
*   `decryptSessionData(token: string): SessionData`

We will also maintain backward compatibility (if the cookie contains a legacy plain `jsessionid` string instead of a serialized JSON object, we will catch the parsing error and safely ask the user to re-authenticate or handle it gracefully).

### C. Re-Authentication Manager (`backend/src/routes/session.ts` or helper module)
We will introduce a helper function:
```typescript
export async function getValidSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<string>
```

This helper performs the following logic:
1.  Read the `auth` cookie. If not present, throw a `NO_SESSION` 401 error.
2.  Decrypt the cookie to retrieve `SessionData`.
3.  Check if the current `jsessionid` is valid by performing a verification check (or verify if we have cached validation details).
4.  If the verification check reveals that the session is expired/invalid:
    *   Initiate a background re-authentication:
        1. Fetch captcha text from WebKiosk (solved automatically via `.noselect` parser).
        2. Send a POST request to WebKiosk auth endpoint with `enrollment`, `password`, `dob`, `role`, and the captcha.
        3. Verify the new session.
    *   If background authentication succeeds:
        *   Update the `SessionData` object with the new `jsessionid`.
        *   Re-encrypt the updated object and call `reply.setCookie` to send the new `auth` cookie header to the user's browser.
        *   Return the new `jsessionid`.
    *   If background authentication fails (e.g. password changed or credentials invalid):
        *   Clear the `auth` cookie.
        *   Throw an `UNAUTHORIZED` 401 error.
5.  If the session is valid, return the active `jsessionid`.

### D. Route Modifications
Update all protected endpoints in:
*   `backend/src/routes/dashboard.ts`
*   `backend/src/routes/attendance.ts`

Replace the manual extraction and verification steps:
```typescript
// BEFORE
const encryptedSession = request.cookies.auth;
const jsessionid = decryptSession(encryptedSession);

// AFTER
const jsessionid = await getValidSession(request, reply);
```

---

## 3. Security Analysis
1.  **Zero Server Database Persistence:** Student credentials are never stored on any backend database.
2.  **Tamper-Proof Encryption:** The cookie payload is encrypted using `aes-256-gcm` which prevents tampering or client-side reading.
3.  **HTTP-Only & Secure:** The `httpOnly` flag blocks access to cookies from JavaScript, mitigating Cross-Site Scripting (XSS) risks.

---

## 4. Verification Plan

### Automated Verification
*   Create Jest test cases verifying that `encryptSessionData` and `decryptSessionData` serialize, encrypt, and decrypt the `SessionData` structure correctly.
*   Test legacy string fallback parsing to ensure it does not crash the server.

### Manual Verification
*   Log in to JUET Nexus.
*   Simulate session timeout by manually modifying or deleting the WebKiosk session cache, or wait 30 minutes.
*   Click any dashboard statistics refresh button.
*   Verify that the dashboard loads the fresh statistics instantly and updates the response cookie header without showing any login screens.
