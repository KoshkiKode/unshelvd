# Security Policy

## Scope

This policy applies to the Unshelv'd web application, REST API, and Capacitor mobile clients. It does **not** cover third-party payment processors (Stripe, PayPal) — report payment-related vulnerabilities directly to those providers.

## Supported Versions

| Component | Supported |
|-----------|----------|
| Web app (latest `main`) | ✅ |
| Mobile (latest release) | ✅ |
| Desktop (Tauri, latest release) | ✅ |
| Older tagged releases | ❌ — upgrade to latest |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: **security@koshkikode.com**

Include:
- A clear description of the vulnerability
- Steps to reproduce (or proof-of-concept)
- Potential impact (data exposure, privilege escalation, etc.)
- Your GitHub handle or preferred contact for follow-up

You can expect an acknowledgement within **72 hours** and a status update within **7 days**.

## Sensitive Data in Scope

- User accounts, email addresses, shipping addresses
- Order history and listing data
- Session tokens and authentication flows
- Stripe Connect / PayPal OAuth tokens (server-side)

## Out of Scope

- Spam, phishing, or social engineering attacks
- Denial-of-service attacks
- Vulnerabilities in dependencies not under KoshkiKode control
- Issues requiring physical device access

## Disclosure Policy

We follow coordinated disclosure. Once a fix is released, we will credit reporters in the relevant release notes (unless you prefer to remain anonymous).

No bug bounty programme is currently active.
