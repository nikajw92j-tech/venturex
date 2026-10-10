import "server-only";
import nodemailer from "nodemailer";
import { env, isProd } from "./env";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!env.smtpUrl) return null;
  transporter ??= nodemailer.createTransport(env.smtpUrl);
  return transporter;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailLayout(opts: { title: string; body: string; cta?: { label: string; url: string } }) {
  const cta = opts.cta
    ? `<p style="margin:28px 0"><a href="${opts.cta.url}" style="background:linear-gradient(90deg,#3b82f6,#8b5cf6);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#05070f;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e2e8f0">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
<div style="font-weight:800;letter-spacing:.2em;font-size:18px;color:#fff">VENTURE<span style="color:#60a5fa">X</span></div>
<div style="margin-top:24px;background:#0b1020;border:1px solid #1e293b;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px;color:#fff">${escapeHtml(opts.title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#cbd5e1">${escapeHtml(opts.body).replace(/\n/g, "<br>")}</div>
${cta}
</div>
<p style="font-size:12px;color:#64748b;margin-top:24px">You received this email because you have an account on VENTUREX. Manage notifications in your dashboard settings.</p>
</div></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const t = getTransport();
  if (!t) {
    if (isProd) console.error(`[email] SMTP_URL not configured — email to ${to} NOT sent: ${subject}`);
    else console.info(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}\n`);
    return false;
  }
  await t.sendMail({ from: env.emailFrom, to, subject, html, text });
  return true;
}
