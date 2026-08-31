# Security Policy

## Reporting a vulnerability
Do not post secrets, private URLs, uploaded evidence, exploit details, or sensitive logs in a public issue. Use GitHub private vulnerability reporting if enabled; otherwise open only a minimal issue until a private channel is established.

## Security expectations
- Never commit model/provider tokens or reusable credentials.
- Treat photos, evidence text, and participant data as private.
- Do not upload evidence to remote AI without explicit user action and disclosure.
- Validate AI/model output before changing scores or winners.
- Keep deterministic fallback/manual override paths available.
- Bound model/network calls with timeouts and keep logs free of evidence contents.
