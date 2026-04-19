/**
 * Unit tests for server/email.ts
 *
 * All external dependencies (platform-settings, nodemailer) are fully mocked
 * so no real SMTP connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted state: lets individual tests configure SMTP behaviour ───────────
const smtpState = vi.hoisted(() => ({
  enabled: true,
  host: null as string | null,
  port: "587",
  user: null as string | null,
  pass: null as string | null,
  from: null as string | null,
}));

vi.mock("../../server/platform-settings", () => ({
  isEnabled: vi.fn(async (_key: string, _def: boolean) => smtpState.enabled),
  getSetting: vi.fn(async (key: string) => {
    const m: Record<string, string | null> = {
      email_smtp_host: smtpState.host,
      email_smtp_port: smtpState.port,
      email_smtp_user: smtpState.user,
      email_smtp_pass: smtpState.pass,
      email_from: smtpState.from,
    };
    return m[key] ?? null;
  }),
}));

// ── Nodemailer transport mock ─────────────────────────────────────────────
const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: "test-id" }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

import {
  invalidateEmailCache,
  sendEmail,
  sendEmailVerification,
  sendPasswordReset,
  sendWelcome,
  sendNewOffer,
  sendOfferUpdated,
  sendPaymentReceived,
  sendBookShipped,
  sendDeliveryConfirmed,
  sendNewMessage,
  sendMatchedListing,
  sendDisputeOpened,
  sendAutoCompleted,
  sendOrderCancelled,
  sendDisputeResolved,
} from "../../server/email";

// ── Helpers ───────────────────────────────────────────────────────────────

function configureSmtp() {
  smtpState.host = "smtp.example.com";
  smtpState.user = "user@example.com";
  smtpState.pass = "s3cr3t";
}

beforeEach(() => {
  invalidateEmailCache();
  vi.clearAllMocks();
  // Default: no SMTP configured (dev mode)
  smtpState.enabled = true;
  smtpState.host = null;
  smtpState.user = null;
  smtpState.pass = null;
  smtpState.from = null;
});

// ──────────────────────────────────────────────────────────────────────────
// sendEmail — dev mode (no SMTP configured)
// ──────────────────────────────────────────────────────────────────────────

describe("sendEmail — dev mode", () => {
  it("logs to console when no SMTP is configured", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail("reader@example.com", "Test Subject", "<p>Hello</p>");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("reader@example.com"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Test Subject"));
    logSpy.mockRestore();
  });

  it("does NOT call sendMail when SMTP is not configured", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail("a@b.com", "S", "<p>B</p>");
    expect(sendMailMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("does NOT call sendMail when email_enabled is false", async () => {
    smtpState.enabled = false;
    configureSmtp();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail("a@b.com", "S", "<p>B</p>");
    expect(sendMailMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendEmail — SMTP configured
// ──────────────────────────────────────────────────────────────────────────

describe("sendEmail — SMTP configured", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("calls transport.sendMail with the correct to, subject and html", async () => {
    await sendEmail("to@test.com", "Hello", "<p>World</p>");
    expect(sendMailMock).toHaveBeenCalledOnce();
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe("to@test.com");
    expect(call.subject).toBe("Hello");
    expect(call.html).toContain("<p>World</p>");
  });

  it("converts HTML to plain text and strips tags", async () => {
    await sendEmail("t@t.com", "S", "<h1>Title</h1><br>Line2");
    const call = sendMailMock.mock.calls[0][0];
    expect(call.text).toContain("Title");
    expect(call.text).toContain("Line2");
    expect(call.text).not.toContain("<h1>");
    expect(call.text).not.toContain("<br>");
  });

  it("decodes HTML entities in the plain-text part", async () => {
    await sendEmail("t@t.com", "S", "<p>a &amp; b &lt;c&gt; &quot;d&quot;</p>");
    const { text } = sendMailMock.mock.calls[0][0];
    expect(text).toContain("a & b <c> \"d\"");
  });

  it("does NOT rethrow when transport.sendMail throws", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("SMTP failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail("t@t.com", "S", "<p>B</p>")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("t@t.com"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("reuses the cached transporter on consecutive calls", async () => {
    await sendEmail("a@t.com", "S1", "<p>1</p>");
    await sendEmail("b@t.com", "S2", "<p>2</p>");
    // createTransport should only be called once (cache hit on second call)
    const nodemailer = await import("nodemailer");
    expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// invalidateEmailCache
// ──────────────────────────────────────────────────────────────────────────

describe("invalidateEmailCache", () => {
  it("forces a fresh transporter to be created after invalidation", async () => {
    configureSmtp();
    await sendEmail("a@t.com", "S1", "<p>1</p>");
    invalidateEmailCache();
    await sendEmail("b@t.com", "S2", "<p>2</p>");
    const nodemailer = await import("nodemailer");
    expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// XSS escaping in email bodies
// ──────────────────────────────────────────────────────────────────────────

describe("XSS escaping", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("escapes script tags in buyer/seller names passed to sendNewOffer", async () => {
    const xssName = '<script>alert("xss")</script>';
    await sendNewOffer("seller@test.com", xssName, "My Book", 10);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes angle brackets in book titles", async () => {
    await sendPaymentReceived("seller@test.com", "Buyer", "<Evil Title>", 25);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("<Evil Title>");
    expect(html).toContain("&lt;Evil Title&gt;");
  });

  it("escapes ampersands in display names", async () => {
    await sendWelcome("user@test.com", "Tom & Jerry");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("Tom &amp; Jerry");
    expect(html).not.toMatch(/Tom & Jerry(?![a-z;])/);
  });

  it("escapes quotes in names used in sendMatchedListing", async () => {
    await sendMatchedListing("r@t.com", 'Alice"Hacker"', "Dune", 42);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain('"Hacker"');
    expect(html).toContain("&quot;Hacker&quot;");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Individual send helpers — subject lines
// ──────────────────────────────────────────────────────────────────────────

describe("send helper subjects (dev mode)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("sendEmailVerification sends the verification subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendEmailVerification("u@t.com", "Alice", "https://example.com/verify");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Verify your Unshelv'd email address"));
  });

  it("sendPasswordReset sends the reset subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendPasswordReset("u@t.com", "https://example.com/reset");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Reset your Unshelv'd password"));
  });

  it("sendWelcome sends the welcome subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendWelcome("u@t.com", "Alice");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Welcome to Unshelv'd!"));
  });

  it("sendNewOffer includes the book title in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendNewOffer("seller@t.com", "Bob", "Dune", 12.5);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Dune"));
  });

  it("sendPaymentReceived includes the book title in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendPaymentReceived("s@t.com", "Buyer", "Dune", 20);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Dune"));
  });

  it("sendDeliveryConfirmed includes the book title in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendDeliveryConfirmed("s@t.com", "Buyer", "Foundation", 18.5);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Foundation"));
  });

  it("sendNewMessage includes the sender name in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendNewMessage("r@t.com", "Alice", "Hey there!");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Alice"));
  });

  it("sendMatchedListing includes the book title in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendMatchedListing("r@t.com", "Bob", "Neuromancer", 5);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Neuromancer"));
  });

  it("sendDisputeOpened includes the book title in the subject", async () => {
    const logSpy = vi.spyOn(console, "log");
    await sendDisputeOpened("s@t.com", "Buyer", "1984");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1984"));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendOfferUpdated — all three statuses
// ──────────────────────────────────────────────────────────────────────────

describe("sendOfferUpdated", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("sends accepted status in subject", async () => {
    await sendOfferUpdated("b@t.com", "accepted", "Dune");
    const { subject } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("accepted");
  });

  it("sends declined status in subject", async () => {
    await sendOfferUpdated("b@t.com", "declined", "Dune");
    const { subject } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("declined");
  });

  it("sends countered status in subject", async () => {
    await sendOfferUpdated("b@t.com", "countered", "Dune", 19.99);
    const { subject } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("countered");
  });

  it("includes counter-offer amount when status is countered", async () => {
    await sendOfferUpdated("b@t.com", "countered", "Dune", 15.5);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("15.50");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendBookShipped — with and without tracking
// ──────────────────────────────────────────────────────────────────────────

describe("sendBookShipped", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("sends a shipped email without tracking info", async () => {
    await sendBookShipped("b@t.com", "Seller", "Dune");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("Dune");
    // Tracking block should not appear
    expect(html).not.toContain("Carrier:");
    expect(html).not.toContain("Tracking:");
  });

  it("includes carrier and tracking number when provided", async () => {
    await sendBookShipped("b@t.com", "Seller", "Dune", "USPS", "9400111899220175657");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("USPS");
    expect(html).toContain("9400111899220175657");
  });

  it("includes carrier only when tracking number is omitted", async () => {
    await sendBookShipped("b@t.com", "Seller", "Dune", "FedEx", null);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("FedEx");
    expect(html).not.toContain("Tracking:");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendNewMessage — preview truncation
// ──────────────────────────────────────────────────────────────────────────

describe("sendNewMessage", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("truncates preview at 120 characters with ellipsis", async () => {
    const longMsg = "A".repeat(130);
    await sendNewMessage("r@t.com", "Alice", longMsg);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("…");
    expect(html).not.toContain("A".repeat(130));
  });

  it("does not truncate a short preview", async () => {
    const shortMsg = "Hello there!";
    await sendNewMessage("r@t.com", "Alice", shortMsg);
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("Hello there!");
    expect(html).not.toContain("…");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendAutoCompleted — buyer vs seller
// ──────────────────────────────────────────────────────────────────────────

describe("sendAutoCompleted", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("mentions the buyer in the buyer auto-complete message", async () => {
    await sendAutoCompleted("b@t.com", "buyer", "Dune");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("automatically");
  });

  it("mentions the payout in the seller auto-complete message", async () => {
    await sendAutoCompleted("s@t.com", "seller", "Dune");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("payout");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendOrderCancelled — buyer vs seller
// ──────────────────────────────────────────────────────────────────────────

describe("sendOrderCancelled", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("mentions refund in the buyer cancellation message", async () => {
    await sendOrderCancelled("b@t.com", "buyer", "Dune");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("cancelled");
  });

  it("mentions re-published listing in the seller cancellation message", async () => {
    await sendOrderCancelled("s@t.com", "seller", "Dune");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("re-published");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// sendDisputeResolved — all four role/resolution combinations
// ──────────────────────────────────────────────────────────────────────────

describe("sendDisputeResolved", () => {
  beforeEach(() => {
    configureSmtp();
  });

  it("tells buyer they are being refunded", async () => {
    await sendDisputeResolved("b@t.com", "buyer", "Dune", "refunded");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("refund");
  });

  it("tells seller the buyer was refunded", async () => {
    await sendDisputeResolved("s@t.com", "seller", "Dune", "refunded");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("refund");
  });

  it("tells seller payment is released to them", async () => {
    await sendDisputeResolved("s@t.com", "seller", "Dune", "released_to_seller");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("release");
  });

  it("tells buyer payment was released to the seller", async () => {
    await sendDisputeResolved("b@t.com", "buyer", "Dune", "released_to_seller");
    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("release");
  });

  it("includes the book title in the subject", async () => {
    await sendDisputeResolved("b@t.com", "buyer", "Foundation", "refunded");
    const { subject } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("Foundation");
  });
});
