/**
 * Shared logout utility
 * Calls backend to clear httpOnly auth cookie, then clears localStorage.
 */

const API_URL = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  : "";

/**
 * Drop the locally cached identity.
 *
 * Also called when the backend rejects a request with 401: the httpOnly cookie
 * is already gone in that case, but `enrollment` survives, and `/login` skips
 * straight back to `/dashboard` on it -- an endless bounce between the two.
 * Clearing here is what makes the redirect to `/login` actually stick.
 */
export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("enrollment");
  localStorage.removeItem("dob");
  localStorage.removeItem("password");
  localStorage.removeItem("role");
}

export async function performLogout(): Promise<void> {
  // 1. Call backend to clear the httpOnly auth cookie
  try {
    await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best-effort — even if backend is unreachable, still clear local state
  }

  // 2. Clear localStorage
  clearStoredSession();
}
