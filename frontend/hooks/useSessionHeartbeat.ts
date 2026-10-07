"use client";

import { useEffect, useRef } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

/**
 * Periodically refreshes the CampusLynx session token and sliding 30-day cookie
 * in the background while the user is actively using the dashboard.
 */
export function useSessionHeartbeat() {
  const lastPingRef = useRef<number>(Date.now());

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const pingRefresh = async () => {
      try {
        lastPingRef.current = Date.now();
        const sessionToken = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
        const headers: Record<string, string> = {};
        if (sessionToken) {
          headers["x-session-token"] = sessionToken;
        }

        const res = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers,
            timeout: 15000,
          }
        );

        const renewed = res.data?.sessionToken || res.headers?.["x-session-token"];
        if (renewed && typeof window !== "undefined") {
          localStorage.setItem("sessionToken", renewed);
        }
      } catch {
        // Background keep-alive is best-effort: silently swallow network blips
      }
    };

    // Ping once shortly after mount (e.g. 5 seconds) to slide session cookie forward
    const initialTimeout = setTimeout(() => {
      pingRefresh();
    }, 5000);

    // Setup recurring interval every 10 minutes
    timer = setInterval(pingRefresh, HEARTBEAT_INTERVAL_MS);

    // Refresh when tab regains focus if more than 5 minutes have passed
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastPingRef.current > 5 * 60 * 1000
      ) {
        pingRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
