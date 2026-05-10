# Security Policy — Unshelv'd

See the [organisation-level security policy](https://github.com/KoshkiKode/.github/blob/main/.github/SECURITY.md) for the full responsible disclosure process, response timelines, and scope.

---

## Unshelv'd-Specific Notes

Unshelv'd handles real financial transactions via Stripe Connect and PayPal. Payment-related vulnerabilities are treated as **critical priority**.

### Areas of Heightened Sensitivity

- **Authentication / session management** — user account takeover
- **Payment flows** — escrow bypass, unauthorized charges, or fund redirection
- **User data** — PII exposure, IDOR vulnerabilities allowing access to another user's listings or messages
- **Seller payouts** — any vulnerability that could redirect or duplicate payouts
- **API endpoints** — missing auth checks, privilege escalation

### Out of Scope for Unshelv'd

- Stripe or PayPal platform vulnerabilities — report those directly to Stripe/PayPal
- Rate limiting on public endpoints that don't expose sensitive data
- Missing security headers on static assets

### Reporting

Use the **GitHub Private Security Advisory** feature on this repository, or follow the contact instructions in the [org-level SECURITY.md](https://github.com/KoshkiKode/.github/blob/main/.github/SECURITY.md).

**Do not open a public issue for security vulnerabilities.**
