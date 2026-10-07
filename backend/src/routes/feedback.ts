import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import { decryptSessionData } from "../utils/encryption";
import { validateFeedback } from "../utils/feedbackValidation";
import { saveFeedbackRecord, getRecentFeedback } from "../db/feedbackRepository";
import type { FeedbackPayload } from "../../../shared/types";

const TARGET_EMAIL = "juetnexus@gmail.com";

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
      return "#ef4444";
    case "feature":
      return "#f59e0b";
    case "improvement":
      return "#8b5cf6";
    default:
      return "#6366f1";
  }
}

function createMailerTransport(): Transporter | null {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!user && !process.env.SMTP_PASS && !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: user || TARGET_EMAIL,
      pass,
    },
  });
}

function buildMailtoUrl(payload: {
  category: string;
  subject: string;
  message: string;
  enrollment?: string | null;
  email?: string | null;
  rating?: number | null;
}): string {
  const categoryLabel = getCategoryLabel(payload.category);
  const subject = encodeURIComponent(`[JUET Nexus - ${categoryLabel}] ${payload.subject}`);
  const bodyText = encodeURIComponent(
    `Category: ${categoryLabel}\n` +
      `Enrollment: ${payload.enrollment || "N/A"}\n` +
      (payload.email ? `Email: ${payload.email}\n` : "") +
      (payload.rating ? `Rating: ${payload.rating}/5\n` : "") +
      `\n--- Feedback ---\n${payload.message}`
  );
  return `mailto:${encodeURIComponent(TARGET_EMAIL)}?subject=${subject}&body=${bodyText}`;
}

export async function registerFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/api/feedback",
    async (request: FastifyRequest<{ Body: FeedbackPayload }>, reply: FastifyReply) => {
      const clientIp =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || request.ip;

      const validation = validateFeedback(request.body, clientIp);
      if (!validation.valid || !validation.sanitized) {
        return reply.status(400).send({
          success: false,
          error: validation.error || "Invalid feedback data",
        });
      }

      const { sanitized } = validation;

      // Extract enrollment from session if not provided in payload
      let enrollment = sanitized.enrollment;
      const authCookie = request.cookies.auth;
      if (!enrollment && authCookie) {
        try {
          const session = decryptSessionData(authCookie);
          enrollment = session.enrollment || session.campusLynx?.enrollmentno || null;
        } catch {
          // ignore session decrypt failure
        }
      }

      // Infer college email if not explicitly provided
      const email =
        sanitized.email || (enrollment ? `${enrollment.toLowerCase()}@juetguna.in` : null);

      const categoryLabel = getCategoryLabel(sanitized.category);
      const categoryColor = getCategoryColor(sanitized.category);
      const subject =
        sanitized.subject || `${categoryLabel} from ${enrollment || "Student"}`;
      const emailSubject = `[JUET Nexus - ${categoryLabel}] ${subject}`;

      const fallbackMailto = buildMailtoUrl({
        category: sanitized.category,
        subject,
        message: sanitized.message,
        enrollment,
        email,
        rating: sanitized.rating,
      });

      let mailed = false;
      const transporter = createMailerTransport();

      if (transporter) {
        try {
          const stars = sanitized.rating
            ? "★".repeat(sanitized.rating) + "☆".repeat(5 - sanitized.rating)
            : null;

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
                      ${
                        sanitized.name
                          ? `<div class="info-item">
                        <div class="info-label">Name</div>
                        <div class="info-value">${escapeHtml(sanitized.name)}</div>
                      </div>`
                          : ""
                      }
                      ${
                        email
                          ? `<div class="info-item">
                        <div class="info-label">Contact Email</div>
                        <div class="info-value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(
                              email
                            )}</a></div>
                      </div>`
                          : ""
                      }
                      ${
                        stars
                          ? `<div class="info-item">
                        <div class="info-label">Rating</div>
                        <div class="info-value" style="color: #f59e0b; font-size: 16px;">${stars} (${sanitized.rating}/5)</div>
                      </div>`
                          : ""
                      }
                    </div>

                    <div style="font-weight: 700; font-size: 16px; color: #0f172a; margin-bottom: 8px;">
                      ${escapeHtml(subject)}
                    </div>

                    <div class="message-box">
                      ${escapeHtml(sanitized.message)}
                    </div>

                    <div class="meta">
                      <div><strong>Received:</strong> ${new Date().toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })} IST</div>
                      ${
                        sanitized.metadata?.url
                          ? `<div><strong>Page:</strong> ${sanitized.metadata.url}</div>`
                          : ""
                      }
                      ${
                        sanitized.metadata?.device
                          ? `<div><strong>Device:</strong> ${sanitized.metadata.device}</div>`
                          : ""
                      }
                      ${
                        sanitized.metadata?.userAgent
                          ? `<div><strong>User Agent:</strong> ${sanitized.metadata.userAgent}</div>`
                          : ""
                      }
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `;

          const textContent =
            `JUET Nexus — Student Feedback\n\n` +
            `Category: ${categoryLabel}\n` +
            `Enrollment: ${enrollment || "N/A"}\n` +
            `Name: ${sanitized.name || "N/A"}\n` +
            `Contact Email: ${email || "N/A"}\n` +
            (sanitized.rating ? `Rating: ${sanitized.rating}/5\n` : "") +
            `Subject: ${subject}\n\n` +
            `--- Message ---\n${sanitized.message}\n\n` +
            `--- Details ---\n` +
            `Date: ${new Date().toISOString()}\n` +
            (sanitized.metadata?.url ? `Page: ${sanitized.metadata.url}\n` : "") +
            (sanitized.metadata?.device ? `Device: ${sanitized.metadata.device}\n` : "");

          await transporter.sendMail({
            from: `"JUET Nexus Feedback" <${process.env.SMTP_USER || TARGET_EMAIL}>`,
            to: TARGET_EMAIL,
            replyTo: email || undefined,
            subject: emailSubject,
            text: textContent,
            html: htmlContent,
          });

          mailed = true;
          request.log.info({ enrollment, category: sanitized.category, subject }, "[Feedback] Successfully emailed");
        } catch (mailError: any) {
          request.log.error(mailError, "[Feedback] Failed to send email via SMTP, fallback link provided");
        }
      } else {
        request.log.info({ enrollment, category: sanitized.category, subject }, "[Feedback] SMTP not configured");
      }

      // Persist feedback to database (with automatic local file fallback)
      const { record, storedInDb } = await saveFeedbackRecord({
        message: sanitized.message,
        category: sanitized.category,
        subject,
        rating: sanitized.rating,
        name: sanitized.name,
        email,
        enrollment,
        metadata: sanitized.metadata,
        mailed,
      });

      return reply.status(200).send({
        success: true,
        id: record.id,
        message: mailed
          ? "Thank you! Your feedback has been sent directly to the development team."
          : "Thank you for your feedback! It has been recorded.",
        mailed,
        storedInDb,
        fallbackMailto,
      });
    }
  );

  fastify.get("/api/feedback", async (_request: FastifyRequest, reply: FastifyReply) => {
    const records = await getRecentFeedback();
    return reply.status(200).send({
      success: true,
      count: records.length,
      feedback: records,
    });
  });
}
