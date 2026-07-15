# Tenderlog

Tenderlog is a private, mobile-first daily parenting log for factual caregiving records, appointments, incidents, immutable corrections, and attorney-reviewable evidence packages.

It is a recordkeeping tool, not legal advice, an emergency service, or a guarantee that any record will be admitted or given a particular weight by a court. Ask local counsel what should be collected, retained, disclosed, or submitted.

## What is implemented

- Per-child daily routine templates and a fast “Today” checklist
- Caregiver attribution, actual occurrence time, duration, outcomes, and factual notes
- Scheduled appointments with responsibility and attendance outcomes
- Neutral incident records for safety hazards and concerning interactions
- Append-only revision history with canonical SHA-256 hashes
- Server-controlled entry timestamps and visible late-entry labels
- Private JPEG, PNG, HEIC, and PDF attachments with file-signature validation
- Searchable combined timeline and authorized attachment downloads
- Finalized-day visibility for read-only attorney reviewers
- Vercel Workflow report generation with PDF, original files, JSON manifest, and checksum ZIP
- Configurable owner-only hard purge with MFA requirement and content-free tombstones
- MongoDB Atlas persistence plus a clearly marked in-memory local demo mode

## Local development

Requirements: Node.js 20.19 or newer and npm 11.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no environment variables, the app runs against an in-memory sample workspace. It is intentionally labeled as demo data and must not be used for real records.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

MongoDB integration tests run when `TEST_MONGODB_URI` is present. Browser tests require Playwright’s Chromium browser (`npx playwright install chromium`).

## Production configuration

Copy `.env.example` to `.env.local` for development. Configure the same values in Vercel for production.

1. Create a dedicated MongoDB Atlas database and least-privilege application user.
2. Create a Clerk application, disable unrestricted registration, enable MFA, and configure the owner email.
3. Create a Vercel Private Blob store.
4. Deploy to Vercel. Workflow SDK routes are generated during the Next.js build.
5. Sign in with `APP_OWNER_EMAIL`; the first matching login bootstraps the private workspace and its initial routine template.
6. Replace placeholder child and caregiver names in Settings before entering real records.

Vercel Workflows use the deployment’s managed workflow backend automatically. Private Blob supports either the legacy read/write token or Vercel OIDC plus a store ID.

## Data integrity model

Saved records are never silently overwritten. A correction creates a new revision containing the previous revision ID, reason, author, server timestamp, and a hash of the canonical payload plus the previous hash. Reports capture the included revision and attachment IDs at creation time.

The integrity controls are tamper-evident application safeguards, not a claim that the system is tamper-proof or that a report is self-authenticating. Export packages include the underlying manifest and checksums so an attorney can evaluate and preserve them with the originals.

Hard purge is disabled by default. When enabled, it removes active record content, attachments, and stored reports containing the record while retaining a content-free deletion tombstone. Already downloaded copies cannot be revoked, and provider backups expire according to their configured retention policy.

## Architecture

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui
- TanStack Query for hydrated interactive reads and cache invalidation
- Validated Server Actions for mutations and authenticated GET Route Handlers for reads
- Native MongoDB Node.js driver with Stable API and transactional record/revision/audit writes
- Clerk identity with application roles stored in MongoDB
- Vercel Private Blob for original files and report artifacts
- React PDF, JSZip, and Vercel Workflow SDK for evidence packages

The repository adapter automatically selects MongoDB when `MONGODB_URI` is configured; otherwise it uses the development-only memory adapter.
