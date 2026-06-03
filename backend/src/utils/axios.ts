import axios from 'axios';
import http from 'http';
import https from 'https';

/**
 * Global configured Axios instance
 * Enables HTTP Keep-Alive to reuse TCP/TLS connections
 * Crucial for performance when hitting WebKiosk multiple times in parallel
 */
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

export const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
});

export default axiosInstance;
