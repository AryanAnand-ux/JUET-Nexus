import axios from "axios";
import { recoverSession } from "@/utils/sessionRecovery";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 45000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("sessionToken");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      config.headers["X-Session-Token"] = token;
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      const newToken =
        response.headers?.["x-session-token"] ||
        response.data?.sessionToken;
      if (newToken && typeof newToken === "string") {
        localStorage.setItem("sessionToken", newToken);
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Do not retry refresh requests themselves or auth verification endpoints
    const url = originalRequest?.url || "";
    const isAuthRoute =
      url.includes("/api/auth/refresh") ||
      url.includes("/api/auth/silent-login") ||
      url.includes("/api/auth/verify-user") ||
      url.includes("/api/auth/session") ||
      url.includes("/api/auth") ||
      url.includes("/api/init") ||
      url.includes("/api/logout");

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const recovered = await recoverSession();
        if (!recovered) {
          processQueue(error);
          return Promise.reject(error);
        }
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr);
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
