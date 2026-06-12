import { FastifyRequest, FastifyReply } from "fastify";
import axios from "../utils/axios";
import { decryptSessionData, encryptSessionData, SessionData } from "../utils/encryption";
import { parseCaptchaImage, extractJSessionId } from "../parsers/auth";
import { getRandomUserAgent } from "../utils/userAgent";

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
        "User-Agent": getRandomUserAgent(),
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
      new URL(WEBKIOSK_AUTH_ACTION, WEBKIOSK_BASE_URL).toString(),
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
    const isNetworkError =
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.toLowerCase().includes('timeout') ||
      (error.response?.status && error.response.status >= 500);

    if (!isNetworkError) {
      reply.clearCookie("auth", { path: "/" });
    }
    throw {
      statusCode: isNetworkError ? 502 : 401,
      message: isNetworkError ? "WebKiosk server is unreachable. Try again." : "Session expired. Please log in again.",
      code: isNetworkError ? "NETWORK_ERROR" : "SESSION_EXPIRED"
    };
  }
}
