# Security and privacy notes

Family Daybook contains highly sensitive information about children and family proceedings. Treat production setup as security-sensitive.

## Required production controls

- Control Clerk registration deliberately. Keep it invitation-only unless self-service owner workspaces are intended, and require MFA for every owner and reviewer.
- Use separate production and non-production Clerk, Atlas, Blob, and Vercel projects.
- Give the Atlas application user access only to the Family Daybook database.
- Require MFA for Atlas, Clerk, Vercel, and source-control administrator accounts.
- Keep Atlas encryption in transit and at rest enabled, configure managed backups, and test restoration.
- Store no credentials in the repository. Rotate credentials after suspected exposure.
- Review Vercel, Clerk, Atlas, and Blob access logs regularly.
- Configure retention and backup expiration with counsel before entering real records.

## Application boundaries

- Every repository call, Server Action, read route, file route, and report route re-checks workspace membership and role.
- Every new owner account receives a separate workspace; authenticated mode fails closed when MongoDB is unavailable instead of sharing in-memory demo state.
- Attorney reviewers have read-only access and see caregiving records only after the corresponding day is finalized.
- Attachments are served through authenticated application routes with private, no-store caching and `nosniff` headers.
- HTML, SVG, executable files, audio, and video are rejected.
- The app does not provide public sharing links, spouse accounts, hidden surveillance, or offline caching.

## Reporting a vulnerability

Do not include real child, family, authentication, or court data in a bug report. Reproduce issues with the local demo workspace and rotate any credential that may have appeared in logs or screenshots.
