/**
 * Unshelv'd — Email Service
 *
 * Sends transactional emails via SMTP (Amazon SES or any provider).
 *
 * Configuration (platform_settings DB values override env vars):
 *   email_enabled        — "true" | "false"  (default true when SMTP is configured)
 *   email_smtp_host      — e.g. "email-smtp.us-east-1.amazonaws.com"
 *   email_smtp_port      — e.g. "587"
 *   email_smtp_user      — SES SMTP username (AKIA...)
 *   email_smtp_pass      — SES SMTP password  ⚠️ secret
 *   email_from           — e.g. "Unshelv'd <noreply@koshkikode.com>"
 *
 * Environment variable equivalents (used when DB settings are absent):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *
 * In development (no SMTP configured), emails are printed to the console.
 *
 * Amazon SES setup for koshkikode.com:
 *   1. AWS Console → SES → Verified Identities → Create Identity → Domain → koshkikode.com
 *      (AWS detects Route 53 and adds DKIM/SPF records automatically)
 *   2. SES → SMTP Settings → Create SMTP Credentials  →  save user + password
 *   3. Request production access (move out of sandbox) so you can email any address
 *   4. Set SMTP_HOST=email-smtp.us-east-1.amazonaws.com, SMTP_PORT=587,
 *      SMTP_USER=<access-key-id>, SMTP_PASS=<smtp-password>, EMAIL_FROM=noreply@koshkikode.com
 */

import nodemailer from "nodemailer";
import { getSetting, isEnabled } from "./platform-settings";

// ── Transporter cache ──────────────────────────────────────────────────────
// We cache the transport to avoid recreating it on every email,
// but expire it after CACHE_TTL_MS so admin SMTP changes take effect.

interface TransportCache {
  transport: nodemailer.Transporter;
  from: string;
  expiresAt: number;
}

let _cache: TransportCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Invalidate the transporter cache (call after updating SMTP settings). */
export function invalidateEmailCache(): void {
  _cache = null;
}

/**
 * Build (or return cached) nodemailer transporter from DB settings / env vars.
 * Returns null when no SMTP credentials are configured (dev / test mode).
 */
async function getTransport(): Promise<{ transport: nodemailer.Transporter; from: string } | null> {
  // Return cached instance if still fresh
  if (_cache && Date.now() < _cache.expiresAt) {
    return { transport: _cache.transport, from: _cache.from };
  }

  // Check enabled flag (default: enabled when SMTP is configured)
  const enabled = await isEnabled("email_enabled", true);
  if (!enabled) return null;

  // Platform settings take priority over env vars
  const host =
    (await getSetting("email_smtp_host")) || process.env.SMTP_HOST || "";
  const rawPort =
    (await getSetting("email_smtp_port")) || process.env.SMTP_PORT || "587";
  const user =
    (await getSetting("email_smtp_user")) || process.env.SMTP_USER || "";
  const pass =
    (await getSetting("email_smtp_pass")) || process.env.SMTP_PASS || "";
  const from =
    (await getSetting("email_from")) ||
    process.env.EMAIL_FROM ||
    "Unshelv'd <noreply@koshkikode.com>";

  if (!host || !user || !pass) return null;

  const port = parseInt(rawPort, 10) || 587;
  const secure = port === 465;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  _cache = { transport, from, expiresAt: Date.now() + CACHE_TTL_MS };
  return { transport, from };
}

// ── Core send function ─────────────────────────────────────────────────────

/**
 * Send a single email.  Falls back to a console log when SMTP is not
 * configured so local development and test environments are never blocked.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const ctx = await getTransport();

  if (!ctx) {
    // Dev / unconfigured — log the email so it is visible during development
    console.log(
      `[email] (not configured — printing to console)\n  To: ${to}\n  Subject: ${subject}\n`,
    );
    return;
  }

  const textBody = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")    // [^>]* (not +) also handles empty <> tags
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")     // amp must be last to prevent double-decoding
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  await ctx.transport.sendMail({
    from: ctx.from,
    to,
    subject,
    html,
    text: textBody,
  });
}

// ── HTML template helpers ──────────────────────────────────────────────────

/** Wrap content in the standard branded email shell. */
function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unshelv'd</title>
</head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;">
            <span style="color:#f4f1eb;font-size:22px;font-weight:700;letter-spacing:-0.5px;">📚 Unshelv'd</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f9f7f4;border-top:1px solid #e8e4dc;">
            <p style="margin:0;color:#888;font-size:12px;text-align:center;">
              You're receiving this email because of your account at
              <a href="https://unshelvd.koshkikode.com" style="color:#888;">unshelvd.koshkikode.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function h1(text: string) {
  return `<h1 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:700;">${text}</h1>`;
}

function p(text: string) {
  return `<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">${text}</p>`;
}

function button(text: string, href: string) {
  return `<p style="margin:24px 0 0;"><a href="${href}" style="display:inline-block;background:#1a1a1a;color:#f4f1eb;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">${text}</a></p>`;
}

function highlight(text: string) {
  return `<div style="background:#f9f7f4;border-left:3px solid #1a1a1a;padding:12px 16px;margin:16px 0;color:#1a1a1a;font-size:15px;">${text}</div>`;
}

/** Escape user-supplied strings before embedding them in HTML email bodies. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Typed send helpers ─────────────────────────────────────────────────────

const APP_URL = "https://unshelvd.koshkikode.com";

/** Email address verification — sent after account creation. */
export async function sendEmailVerification(
  to: string,
  displayName: string,
  verifyUrl: string,
): Promise<void> {
  const html = wrap(
    h1(`Verify your email address`) +
      p(`Hi ${esc(displayName)}! Please verify your email address to unlock all features of Unshelv'd.`) +
      p("This link expires in <strong>24 hours</strong>.") +
      button("Verify Email", verifyUrl),
  );
  await sendEmail(to, "Verify your Unshelv'd email address", html);
}

/** Password reset email — sent when user requests a reset link. */
export async function sendPasswordReset(
  to: string,
  resetUrl: string,
): Promise<void> {
  const html = wrap(
    h1("Reset your password") +
      p("Someone requested a password reset for your Unshelv'd account. Click the button below to choose a new password.") +
      p("This link expires in <strong>1 hour</strong>. If you did not request a reset, you can safely ignore this email.") +
      button("Reset Password", resetUrl),
  );
  await sendEmail(to, "Reset your Unshelv'd password", html);
}

/** Welcome email — sent after a new account is created. */
export async function sendWelcome(
  to: string,
  displayName: string,
): Promise<void> {
  const html = wrap(
    h1(`Welcome, ${esc(displayName)}! 👋`) +
      p("Your Unshelv'd account is ready. You can now list books for sale, browse the catalog, and connect with other readers.") +
      button("Browse Books", `${APP_URL}/#/browse`),
  );
  await sendEmail(to, "Welcome to Unshelv'd!", html);
}

/** Notify seller that a buyer has submitted an offer on their book. */
export async function sendNewOffer(
  to: string,
  buyerName: string,
  bookTitle: string,
  amount: number,
): Promise<void> {
  const html = wrap(
    h1("You have a new offer!") +
      p(`<strong>${esc(buyerName)}</strong> has made an offer on your listing.`) +
      highlight(`📖 <strong>${esc(bookTitle)}</strong><br>Offer amount: <strong>$${amount.toFixed(2)}</strong>`) +
      p("Log in to accept, decline, or counter the offer.") +
      button("View Offer", `${APP_URL}/#/dashboard/offers`),
  );
  await sendEmail(to, `New offer on "${esc(bookTitle)}"`, html);
}

/** Notify buyer of an offer status change (accepted / declined / countered). */
export async function sendOfferUpdated(
  to: string,
  status: "accepted" | "declined" | "countered",
  bookTitle: string,
  counterAmount?: number | null,
): Promise<void> {
  const labels: Record<string, string> = {
    accepted: "accepted ✅",
    declined: "declined",
    countered: "countered 🔄",
  };
  const label = labels[status] ?? status;

  let body =
    h1(`Your offer was ${esc(label)}`) +
    highlight(`📖 <strong>${esc(bookTitle)}</strong>`);

  if (status === "accepted") {
    body += p("Great news! The seller accepted your offer. Head to your offers page to proceed with payment.");
    body += button("Complete Purchase", `${APP_URL}/#/dashboard/offers`);
  } else if (status === "countered" && counterAmount) {
    body += p(`The seller has made a counter-offer of <strong>$${counterAmount.toFixed(2)}</strong>.`);
    body += button("View Counter-Offer", `${APP_URL}/#/dashboard/offers`);
  } else {
    body += p("The seller has declined your offer. You can browse other listings or make a new offer.");
    body += button("Browse Books", `${APP_URL}/#/browse`);
  }

  await sendEmail(to, `Your offer on "${esc(bookTitle)}" was ${status}`, wrap(body));
}

/** Notify seller that payment has been received for their book. */
export async function sendPaymentReceived(
  to: string,
  buyerName: string,
  bookTitle: string,
  amount: number,
): Promise<void> {
  const html = wrap(
    h1("Payment received! 💰") +
      p(`<strong>${esc(buyerName)}</strong> has paid for your book.`) +
      highlight(`📖 <strong>${esc(bookTitle)}</strong><br>Amount: <strong>$${amount.toFixed(2)}</strong>`) +
      p("Please ship the book as soon as possible and enter the tracking number in your transactions page.") +
      button("Mark as Shipped", `${APP_URL}/#/dashboard`),
  );
  await sendEmail(to, `Payment received for "${esc(bookTitle)}"`, html);
}

/** Notify buyer that their book has been shipped. */
export async function sendBookShipped(
  to: string,
  sellerName: string,
  bookTitle: string,
  carrier?: string | null,
  trackingNumber?: string | null,
): Promise<void> {
  let trackingInfo = "";
  if (carrier || trackingNumber) {
    trackingInfo = highlight(
      `🚚 ${carrier ? `Carrier: <strong>${esc(carrier)}</strong><br>` : ""}${trackingNumber ? `Tracking: <strong>${esc(trackingNumber)}</strong>` : ""}`,
    );
  }

  const html = wrap(
    h1("Your book is on its way! 📦") +
      p(`<strong>${esc(sellerName)}</strong> has shipped your order.`) +
      highlight(`📖 <strong>${esc(bookTitle)}</strong>`) +
      trackingInfo +
      p("Once your book arrives, please confirm delivery so the seller receives their payment.") +
      button("Confirm Delivery", `${APP_URL}/#/dashboard`),
  );
  await sendEmail(to, `Your copy of "${esc(bookTitle)}" has been shipped!`, html);
}

/** Notify seller that the buyer confirmed delivery and payout is on its way. */
export async function sendDeliveryConfirmed(
  to: string,
  buyerName: string,
  bookTitle: string,
  payout: number,
): Promise<void> {
  const html = wrap(
    h1("Delivery confirmed — payout on its way! 🎉") +
      p(`<strong>${esc(buyerName)}</strong> confirmed receipt of your book.`) +
      highlight(`📖 <strong>${esc(bookTitle)}</strong><br>Your payout: <strong>$${payout.toFixed(2)}</strong>`) +
      p("Your earnings will be transferred to your connected Stripe account within 2–7 business days.") +
      button("View Transaction", `${APP_URL}/#/dashboard`),
  );
  await sendEmail(to, `Sale complete for "${esc(bookTitle)}"`, html);
}

/** Notify user of a new direct message (fire-and-forget). */
export async function sendNewMessage(
  to: string,
  senderName: string,
  preview: string,
): Promise<void> {
  const safePreview = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
  const html = wrap(
    h1(`New message from ${esc(senderName)}`) +
      highlight(`"${esc(safePreview)}"`) +
      button("Reply", `${APP_URL}/#/dashboard/messages`),
  );
  await sendEmail(to, `New message from ${esc(senderName)}`, html);
}

/** Notify a book-request owner that a matching listing has appeared. */
export async function sendMatchedListing(
  to: string,
  requesterName: string,
  bookTitle: string,
  bookId: number,
): Promise<void> {
  const html = wrap(
    h1("A book you requested is available! 🔔") +
      p(`Hi ${esc(requesterName)}! Good news — a seller just listed a copy of a book that matches one of your requests.`) +
      highlight(`📖 <strong>${esc(bookTitle)}</strong>`) +
      button("View Listing", `${APP_URL}/#/book/${bookId}`),
  );
  await sendEmail(to, `"${esc(bookTitle)}" is now available on Unshelv'd`, html);
}

/** Auto-complete notification — sent to both parties when a transaction is automatically completed. */
export async function sendAutoCompleted(
  to: string,
  role: "buyer" | "seller",
  bookTitle: string,
): Promise<void> {
  const msg =
    role === "buyer"
      ? "Your transaction has been automatically marked as completed (14 days have passed since shipment with no delivery confirmation from you)."
      : "Your transaction has been automatically completed after 14 days. Your payout is on its way.";

  const html = wrap(
    h1("Transaction auto-completed") +
      highlight(`📖 <strong>${esc(bookTitle)}</strong>`) +
      p(msg) +
      button("View Transactions", `${APP_URL}/#/dashboard`),
  );
  await sendEmail(to, `Transaction auto-completed for "${esc(bookTitle)}"`, html);
}
