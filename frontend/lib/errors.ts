/**
 * errors.ts
 *
 * Shared error types for the portal client.
 */

export class PortalError extends Error {
  code: string;
  httpStatus?: number;
  status?: number;
  data?: unknown;

  constructor(
    message: string,
    optsOrStatus: { code?: string; httpStatus?: number } | number = {},
    data?: unknown
  ) {
    super(message);
    this.name = "PortalError";
    if (typeof optsOrStatus === "number") {
      this.httpStatus = optsOrStatus;
      this.status = optsOrStatus;
      this.code = optsOrStatus === 401 ? "SESSION_EXPIRED" : "PORTAL_ERROR";
      this.data = data;
    } else {
      this.code = optsOrStatus.code ?? "PORTAL_ERROR";
      this.httpStatus = optsOrStatus.httpStatus;
      this.status = optsOrStatus.httpStatus;
    }
  }
}

export class SessionExpiredError extends PortalError {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message, { code: "SESSION_EXPIRED" });
    this.name = "SessionExpiredError";
  }
}

export class NetworkError extends PortalError {
  constructor(message = "Network error. Please check your connection.") {
    super(message, { code: "NETWORK_ERROR" });
    this.name = "NetworkError";
  }
}

export class RequestTimeoutError extends PortalError {
  constructor(message = "JUET's portal took too long to respond. Please retry.") {
    super(message, { code: "REQUEST_TIMEOUT" });
    this.name = "RequestTimeoutError";
  }
}

/** Map a raw portal response body + HTTP status to a typed PortalError. */
export function toPortalError(
  body: Record<string, unknown> | null,
  httpStatus: number
): PortalError {
  const msg =
    (body?.message as string) ||
    (body?.error as string) ||
    (body?.status as Record<string, string>)?.message ||
    `Portal error (HTTP ${httpStatus})`;

  const rawCode =
    (body?.code as string) ||
    (body?.status as Record<string, string>)?.responseStatus;

  if (
    rawCode === "SESSION_EXPIRED" ||
    httpStatus === 401 ||
    /token.*expir|session.*expir|unauthorized/i.test(msg)
  ) {
    return new SessionExpiredError();
  }

  return new PortalError(msg, { code: rawCode ?? "PORTAL_ERROR", httpStatus });
}
