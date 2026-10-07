import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 60000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const sessionToken = localStorage.getItem("sessionToken");
    if (sessionToken) {
      config.headers = config.headers || {};
      config.headers["x-session-token"] = sessionToken;
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
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not retry refresh requests themselves or already retried requests
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/api/auth/refresh") &&
      !originalRequest.url?.includes("/api/auth/verify-user")
    ) {
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
        const sessionToken =
          typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
        const headers: Record<string, string> = {};
        if (sessionToken) {
          headers["x-session-token"] = sessionToken;
        }

        const res = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true, headers, timeout: 15000 }
        );

        const renewed = res.data?.sessionToken || res.headers?.["x-session-token"];
        if (renewed && typeof window !== "undefined") {
          localStorage.setItem("sessionToken", renewed);
          if (originalRequest.headers) {
            originalRequest.headers["x-session-token"] = renewed;
          }
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
