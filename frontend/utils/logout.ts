/**
 * Shared logout utility
 * Calls backend to clear httpOnly auth cookie, then clears localStorage.
 */

const API_URL = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  : "";

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
  if (typeof window !== "undefined") {
    localStorage.removeItem("enrollment");
    localStorage.removeItem("dob");
    localStorage.removeItem("password");
    localStorage.removeItem("role");
  }
}
