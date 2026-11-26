/**
 * /api/proxy/[...path]
 *
 * Thin Next.js App Router serverless proxy to CampusLynx ERP:
 *  - Spoofs Origin & Referer to studentportal.juet.ac.in (portal 403s otherwise)
 *  - Strips hop-by-hop & proxy headers
 *  - Uses a module-level keep-alive https.Agent for connection pooling
 *  - Streams response body directly with 55s upstream timeout
 *  - Enforces 512 KiB request body limit
 */

import https from "node:https";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PORTAL_ORIGIN = "https://studentportal.juet.ac.in";
const PORTAL_REFERER = `${PORTAL_ORIGIN}/studentportal/`;
const UPSTREAM_BASE = (
  process.env.PORTAL_BASE_URL ||
  "https://studentportal.juet.ac.in/StudentPortalAPI"
).replace(/\/+$/, "");

const MAX_BODY_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 55_000;
const PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;

const DROP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "content-length",
  "transfer-encoding",
  "te",
  "trailer",
  "via",
  "upgrade",
  "expect",
  "proxy-authenticate",
  "proxy-authorization",
  "cdn-loop",
  "accept-encoding",
  "origin",
  "referer",
  "forwarded",
  "cookie",
  "user-agent",
  "accept",
]);

const rejectUnauthorized = process.env.PORTAL_REJECT_UNAUTHORIZED === "true";

const upstreamAgent = new https.Agent({
  keepAlive: true,
  maxFreeSockets: 8,
  maxSockets: 20,
  timeout: 5_000,
  rejectUnauthorized,
});

function buildUpstreamTarget(segments: string[], search: string): string {
  if (
    !segments.length ||
    segments.some((s) => !PATH_SEGMENT.test(s) || s === "." || s === "..")
  ) {
    throw new TypeError("Invalid proxy path");
  }
  const cleanPath = segments.map(encodeURIComponent).join("/");
  return `${UPSTREAM_BASE}/${cleanPath}${search}`;
}

function forwardUpstream(
  target: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  signal: AbortSignal
): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  stream: NodeJS.ReadableStream;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    let settled = false;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method,
        headers,
        agent: upstreamAgent,
        rejectUnauthorized,
      },
      (res) => {
        res.on("error", () => {});
        if (settled) {
          res.resume();
          return;
        }
        settled = true;
        resolve({
          statusCode: res.statusCode ?? 502,
          headers: res.headers,
          stream: res,
        });
      }
    );

    const onAbort = () => {
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      }
      req.destroy();
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error("Upstream timeout"), { code: "UPSTREAM_TIMEOUT" }));
      }
      req.destroy();
    });

    req.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    req.end(body);
  });
}

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  let target: string;
  try {
    target = buildUpstreamTarget(path, req.nextUrl.search);
  } catch {
    return Response.json({ message: "Invalid proxy path" }, { status: 400 });
  }

  const method = req.method.toUpperCase();
  const headers: Record<string, string> = {
    Origin: PORTAL_ORIGIN,
    Referer: PORTAL_REFERER,
    "Accept-Encoding": "identity",
    Accept: req.headers.get("accept") || "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  req.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (
      DROP_HEADERS.has(lk) ||
      lk.startsWith("x-forwarded") ||
      lk.startsWith("x-vercel") ||
      lk.startsWith("sec-") ||
      lk === "x-real-ip"
    ) {
      return;
    }
    headers[key] = value;
  });

  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const contentLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json(
        { status: { responseStatus: "Failure" }, message: "Payload Too Large" },
        { status: 413 }
      );
    }

    const arrayBuf = await req.arrayBuffer();
    if (arrayBuf.byteLength > MAX_BODY_BYTES) {
      return Response.json(
        { status: { responseStatus: "Failure" }, message: "Payload Too Large" },
        { status: 413 }
      );
    }
    if (arrayBuf.byteLength > 0) {
      body = Buffer.from(arrayBuf);
      headers["content-length"] = String(body.length);
    }
  }

  try {
    const upstream = await forwardUpstream(
      target,
      method,
      headers,
      body,
      req.signal
    );

    const outHeaders = new Headers();
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("Cache-Control", "no-store");

    const contentType = upstream.headers["content-type"];
    if (typeof contentType === "string") {
      outHeaders.set("Content-Type", contentType);
    } else {
      outHeaders.set("Content-Type", "application/json");
    }

    const setCookies = upstream.headers["set-cookie"];
    if (Array.isArray(setCookies)) {
      for (const c of setCookies) {
        outHeaders.append(
          "Set-Cookie",
          c
            .replace(/;\s*[Dd]omain=[^;]*/g, "")
            .replace(/;\s*[Pp]ath=[^;]*/g, "; Path=/")
        );
      }
    }

    // Wait for the first body byte or clean EOF before committing Response headers,
    // so a pre-body upstream timeout/abort still delivers a clean 504/502 JSON.
    const { firstChunk, ended } = await new Promise<{
      firstChunk: Buffer | null;
      ended: boolean;
    }>((resolve, reject) => {
      const s = upstream.stream;
      const cleanup = () => {
        s.removeListener("data", onData);
        s.removeListener("end", onEnd);
        s.removeListener("error", onError);
        s.removeListener("close", onClose);
        req.signal.removeEventListener("abort", onAbort);
      };
      const onData = (chunk: Buffer) => {
        if (!chunk?.length) return;
        s.pause();
        cleanup();
        resolve({ firstChunk: chunk, ended: false });
      };
      const onEnd = () => {
        cleanup();
        resolve({ firstChunk: null, ended: true });
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }));
      };
      const onAbort = () => {
        cleanup();
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      };
      if (req.signal.aborted) {
        onAbort();
        return;
      }
      s.on("data", onData);
      s.once("end", onEnd);
      s.once("error", onError);
      s.once("close", onClose);
      req.signal.addEventListener("abort", onAbort, { once: true });
    });

    const streamObj = upstream.stream as NodeJS.ReadableStream & {
      readableEnded?: boolean;
      destroyed?: boolean;
    };

    if (ended || streamObj.readableEnded) {
      return new Response(firstChunk ? new Uint8Array(firstChunk) : null, {
        status: upstream.statusCode,
        headers: outHeaders,
      });
    }

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const safeClose = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };
        if (firstChunk) {
          controller.enqueue(new Uint8Array(firstChunk));
        }
        if (streamObj.readableEnded) {
          safeClose();
          return;
        }
        upstream.stream.on("data", (chunk: Buffer) => {
          if (!closed && chunk?.length) {
            controller.enqueue(new Uint8Array(chunk));
          }
        });
        upstream.stream.once("end", safeClose);
        upstream.stream.once("close", safeClose);
        upstream.stream.once("error", (err) => {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        });
        upstream.stream.resume();
      },
      cancel() {
        if ("destroy" in upstream.stream && typeof upstream.stream.destroy === "function") {
          upstream.stream.destroy();
        }
      },
    });

    return new Response(webStream, {
      status: upstream.statusCode,
      headers: outHeaders,
    });
  } catch (err: unknown) {
    const e = err as { name?: string; code?: string; message?: string };
    if (e?.name === "AbortError" || req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    const isTimeout = e?.code === "UPSTREAM_TIMEOUT";
    return Response.json(
      {
        status: { responseStatus: "Failure" },
        message: isTimeout ? "Gateway Timeout" : "Upstream unreachable",
        detail: isTimeout ? "upstream timeout" : String(e?.message ?? err).slice(0, 200),
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(req, context);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(req, context);
}
