import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import { decryptSessionData } from "../utils/encryption";
import type { FeedbackPayload, FeedbackResponse } from "../../../shared/types";

const TARGET_EMAIL = "juetnexus@gmail.com";

/** Escape user-supplied strings before interpolating into HTML email bodies. */
function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case "bug":
      return "Bug Report";
    case "feature":
      return "Feature Request";
    case "improvement":
      return "Improvement";
    default:
      return "General Feedback";
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "bug":
      return "#ef4444"; // red
    case "feature":
      return "#f59e0b"; // amber
    case "improvement":
      return "#8b5cf6"; // purple
    default:
      return "#6366f1"; // indigo
  }
}

export function buildMailtoUrl(payload: FeedbackPayload): string {
  const categoryLabel = getCategoryLabel(payload.category);
  const subject = `[JUET Nexus - ${categoryLabel}] ${payload.subject || "Student Feedback"}`;
  const lines = [
    `Category: ${categoryLabel}`,
    payload.enrollment ? `Enrollment: ${payload.enrollment}` : "",
    payload.name ? `Name: ${payload.name}` : "",
    payload.email ? `Email: ${payload.email}` : "",
    payload.rating ? `Rating: ${payload.rating}/5` : "",
    "",
    "--- Message ---",
    payload.message,
    "",
    "--- Device / Context ---",
    payload.metadata?.url ? `URL: ${payload.metadata.url}` : "",
    payload.metadata?.device ? `Device: ${payload.metadata.device}` : "",
  ].filter(Boolean);

  const body = lines.join("\n");
  return `mailto:${encodeURIComponent(TARGET_EMAIL)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export function createMailerTransport(): Transporter | null {
  const rawPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : null;
  const user = (process.env.SMTP_USER || TARGET_EMAIL).trim();

  if (!pass) {
    return null;
  }

  // If standard SMTP host is provided
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user, pass },
    });
  }

  // Default to Gmail service
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function registerFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/api/feedback",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minutes",
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body || {}) as FeedbackPayload;
      const message = String(body.message || "").trim();

      if (!message) {
        return reply.status(400).send({
          success: false,
          error: "Message is required to submit feedback.",
        });
      }

      // Try extracting enrollment from session if not provided
      let enrollment = body.enrollment;
      if (!enrollment && request.cookies?.auth) {
        try {
          const session = decryptSessionData(request.cookies.auth);
          enrollment = session.enrollment || session.campusLynx?.enrollmentno;
        } catch {
          // ignore session decrypt error
        }
      }

      const category = body.category || "general";
      const categoryLabel = getCategoryLabel(category);
      const categoryColor = getCategoryColor(category);
      const subject = body.subject?.trim() || `${categoryLabel} from ${enrollment || "Student"}`;
      const emailSubject = `[JUET Nexus - ${categoryLabel}] ${subject}`;

      const payloadWithEnrollment: FeedbackPayload = {
        ...body,
        category,
        subject,
        message,
        enrollment,
      };

      const fallbackMailto = buildMailtoUrl(payloadWithEnrollment);

      let mailed = false;
      const transporter = createMailerTransport();

      if (transporter) {
        try {
          const stars = body.rating ? "★".repeat(body.rating) + "☆".repeat(5 - body.rating) : null;
          const htmlContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
                  .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                  .header { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: #ffffff; padding: 24px 28px; }
                  .header h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
                  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; color: #ffffff; background-color: ${categoryColor}; margin-top: 8px; }
                  .content { padding: 28px; }
                  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; }
                  .info-item { font-size: 13px; }
                  .info-label { font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
                  .info-value { font-weight: 600; color: #0f172a; margin-top: 2px; }
                  .message-box { background: #f8fafc; border-left: 4px solid ${categoryColor}; border-radius: 8px; padding: 18px 20px; margin: 20px 0; font-size: 15px; color: #1e293b; white-space: pre-wrap; }
                  .meta { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="header">
                    <h2>JUET Nexus — Student Feedback</h2>
                    <span class="badge">${categoryLabel}</span>
                  </div>
                  <div class="content">
                    <div class="info-grid">
                      <div class="info-item">
                        <div class="info-label">Student Enrollment</div>
                        <div class="info-value">${escapeHtml(enrollment) || "Anonymous / Not logged in"}</div>
                      </div>
                      ${body.name ? `
                      <div class="info-item">
                        <div class="info-label">Name</div>
                        <div class="info-value">${escapeHtml(body.name)}</div>
                      </div>` : ""}
                      ${body.email ? `
                      <div class="info-item">
                        <div class="info-label">Contact Email</div>
                        <div class="info-value"><a href="mailto:${escapeHtml(body.email)}">${escapeHtml(body.email)}</a></div>
                      </div>` : ""}
                      ${stars ? `
                      <div class="info-item">
                        <div class="info-label">Rating</div>
                        <div class="info-value" style="color: #f59e0b; font-size: 16px;">${stars} (${body.rating}/5)</div>
                      </div>` : ""}
                    </div>

                    <div style="font-weight: 700; font-size: 16px; color: #0f172a; margin-bottom: 8px;">
                      ${escapeHtml(subject)}
                    </div>

                    <div class="message-box">
                      ${escapeHtml(message)}
                    </div>

                    <div class="meta">
                      <div><strong>Received:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
                      ${body.metadata?.url ? `<div><strong>Page:</strong> ${body.metadata.url}</div>` : ""}
                      ${body.metadata?.device ? `<div><strong>Device:</strong> ${body.metadata.device}</div>` : ""}
                      ${body.metadata?.userAgent ? `<div><strong>User Agent:</strong> ${body.metadata.userAgent}</div>` : ""}
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `;

          const textContent = `JUET Nexus — Student Feedback\n\n` +
            `Category: ${categoryLabel}\n` +
            `Enrollment: ${enrollment || "N/A"}\n` +
            `Name: ${body.name || "N/A"}\n` +
            `Contact Email: ${body.email || "N/A"}\n` +
            (body.rating ? `Rating: ${body.rating}/5\n` : "") +
            `Subject: ${subject}\n\n` +
            `--- Message ---\n${message}\n\n` +
            `--- Details ---\n` +
            `Date: ${new Date().toISOString()}\n` +
            (body.metadata?.url ? `Page: ${body.metadata.url}\n` : "") +
            (body.metadata?.device ? `Device: ${body.metadata.device}\n` : "");

          await transporter.sendMail({
            from: `"JUET Nexus Feedback" <${process.env.SMTP_USER || TARGET_EMAIL}>`,
            to: TARGET_EMAIL,
            replyTo: body.email || undefined,
            subject: emailSubject,
            text: textContent,
            html: htmlContent,
          });

          mailed = true;
          request.log.info({ enrollment, category, subject }, "[Feedback] Successfully emailed to juetnexus@gmail.com");
        } catch (mailError: any) {
          request.log.error(mailError, "[Feedback] Failed to send email via SMTP, fallback link provided");
        }
      } else {
        request.log.info({ enrollment, category, subject }, "[Feedback] SMTP not configured; recorded feedback to server logs");
      }

      const response: FeedbackResponse = {
        success: true,
        message: mailed
          ? "Thank you! Your feedback has been sent directly to the development team."
          : "Thank you for your feedback! It has been recorded.",
        mailed,
        fallbackMailto,
      };

      return reply.status(200).send(response);
    }
  );
}
