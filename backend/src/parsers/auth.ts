import { JSDOM } from 'jsdom';
import axios from '../utils/axios';

/**
 * Extracts JSESSIONID from a cookie header string
 */
export function extractJSessionId(cookieHeader: string): string | null {
  return cookieHeader.match(/JSESSIONID=([^;]+)/)?.[1] || null;
}

/**
 * Converts plain text into a dummy SVG captcha image
 */
export function textToCaptchaImage(text: string): string {
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="56" viewBox="0 0 180 56">
      <rect width="180" height="56" fill="#d5d6d8"/>
      <line x1="8" y1="42" x2="172" y2="14" stroke="#6b7280" stroke-width="2"/>
      <text x="90" y="37" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-style="italic" fill="#111827" text-decoration="line-through">${escapedText}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Parses the WebKiosk login page to extract the Captcha
 * Returns an object with the base64 image and the raw text (if available)
 */
export async function parseCaptchaImage(
  htmlData: string,
  webKioskBaseUrl: string,
  cookieHeader: string,
  requestTimeout: number
): Promise<{ captchaImageBase64: string; captchaValue: string | null }> {
  const dom = new JSDOM(htmlData);
  const document = dom.window.document;

  let captchaImageBase64 = "";
  const captchaImg = document.querySelector("img[src*='captcha']") as HTMLImageElement;
  const captchaText = document.querySelector(".noselect")?.textContent?.trim();

  if (captchaText) {
    captchaImageBase64 = textToCaptchaImage(captchaText);
  } else if (captchaImg) {
    const captchaImageUrl = new URL(
      captchaImg.getAttribute("src") || captchaImg.src,
      webKioskBaseUrl
    ).toString();

    if (captchaImageUrl.startsWith("data:")) {
      captchaImageBase64 = captchaImageUrl;
    } else {
      const captchaResponse = await axios.get(captchaImageUrl, {
        responseType: "arraybuffer",
        timeout: requestTimeout,
        withCredentials: true,
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      });
      const base64 = Buffer.from(captchaResponse.data).toString("base64");
      const contentType = captchaResponse.headers["content-type"] || "image/png";
      captchaImageBase64 = `data:${contentType};base64,${base64}`;
    }
  } else {
    throw new Error("Captcha not found in login page");
  }

  return {
    captchaImageBase64,
    captchaValue: captchaText || null,
  };
}
