# NCR Tech Internship Finder

A placement-committee platform for discovering, verifying, and reporting on B.Tech CSE internships across Delhi NCR. Gurugram is the first-priority market, followed by Noida, Delhi, and Faridabad.

The application is deliberately **not an automated job board**. API results enter a human review queue and stay `pending` until a committee member records a decision. Only records marked **Verified Active** count toward the 20-opportunity placement target.

## What it does

- **Dashboard** — target progress, verification queue, category coverage, location distribution, recent opportunities, and pending-review work.
- **Discover Jobs** — 16 internship keywords, priority-city selection, JSearch and optional Adzuna sources, rolling 24-hour search quota, and AI-assisted extraction when Gemini is configured.
- **All Opportunities** — searchable directory with filters for city, category, status, source, work mode, stipend, shortlist state, and sorting.
- **Verification Centre** — queue by status, original-posting checklist, SSRF-protected link checking, reviewer attribution, decision notes, and an immutable audit trail.
- **Companies** — employer directory with verified-active counts, city coverage, shortlisted roles, and linked opportunities.
- **Reports** — verified-only or full-directory Excel/PDF exports, live preview, category scope, configurable columns, and export history.
- **Settings** — committee profile, priority-city order, category focus, integration readiness, runtime status, and maintenance actions.

## Architecture

```text
NCR Tech Internship Finder
├── frontend/                 Vite multi-page app
│   ├── *.html                Seven root-level pages
│   ├── src/css/              Application, page-specific, and responsive styles
│   ├── src/js/               Shared shell, API client, UI helpers, drawers, page controllers
│   └── vite.config.js        Multi-page production build
├── backend/
│   ├── app.js                Express application and static frontend serving
│   ├── server.js             Startup and graceful shutdown
│   ├── routes/               HTTP routes
│   ├── controllers/          Request/response handling
│   ├── services/             Discovery, normalisation, Gemini, link checking, analytics
│   ├── services/store/       Supabase and local JSON store implementations
│   ├── middleware/           CORS, security headers, rate limiting
│   ├── utils/                Validation, text/date/URL helpers, auth, errors
│   └── tests/                Vitest unit and API integration tests
├── database/migrations/      Supabase PostgreSQL schema
└── package.json              npm workspaces and root scripts
```

### Stack

- Frontend: HTML5, CSS3, vanilla JavaScript, jQuery, Chart.js, Lucide, SheetJS, jsPDF + AutoTable, Axios
- Build: Vite
- Backend: Node.js, Express, Zod, Axios, Helmet, express-rate-limit
- Data: Supabase PostgreSQL in production, local JSON store for development
- Integrations: JSearch, Adzuna (optional), Google Gemini (optional)
- Tests: Vitest + Supertest

### Data-flow guarantees

1. External results are normalised and validated before storage.
2. Duplicate detection checks source ID, application URL, then company/role/city fingerprint.
3. Every imported or manually added record starts as `pending`.
4. API keys stay on the backend; the browser receives only configuration flags.
5. `verified_active` requires a reviewer name and explicit confirmation that the original employer posting was opened.
6. The verification audit trail is append-only through the application API.
7. Reports export only records that are currently verified and active when using the verified-only report type.

## Quick start

### Prerequisites

- Node.js **20.19+** (Node 22 recommended)
- npm 10+
- Optional: a Supabase project, JSearch key, Adzuna credentials, and a Gemini API key

### Install

```bash
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is recommended because the SheetJS package is installed from SheetJS's CDN tarball. If your npm version installs it without the flag, plain `npm install` is fine.

### Configure

```bash
cp backend/.env.example backend/.env
```

For local development, the defaults work without any API keys:

- database: local JSON store at `backend/data/local-db.json`
- frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- authentication: disabled while `APP_PASSWORD` is blank

Add API keys as needed:

```dotenv
JSEARCH_API_KEY=...
ADZUNA_APP_ID=...
ADZUNA_APP_KEY=...
GEMINI_API_KEY=...
```

### Run

```bash
npm run dev
```

This starts both workspaces:

- Vite frontend: `http://localhost:5173`
- Express API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

Open the Vite URL. The frontend proxies `/api` requests to Express.

### Production build

```bash
npm run build
npm start
```

Express serves `frontend/dist` at `http://localhost:4000`. Root-level URLs such as `/discover.html` and `/verification.html` are the canonical production pages.

## Environment variables

All backend variables live in `backend/.env`. See `backend/.env.example` for the annotated list.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Recommended | `development`, `test`, or `production`. Production requires auth unless explicitly public. |
| `PORT` | No | API port. Default `4000`. |
| `FRONTEND_ORIGIN` | Development | Vite origin used for CORS. Default `http://localhost:5173`. |
| `ALLOWED_ORIGINS` | Split deployment | Comma-separated extra origins for a separately hosted frontend. |
| `ALLOW_PUBLIC_ACCESS` | Production | Set `true` only for an intentionally public deployment when `APP_PASSWORD` is blank. |
| `LOCAL_STORE_FILE` | No | Local JSON store path. Default `./data/local-db.json`. |
| `SUPABASE_URL` | Production | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Server-only service role key. Never expose it to the frontend. |
| `JSEARCH_API_KEY` | For live discovery | JSearch RapidAPI key. |
| `JSEARCH_API_HOST` | No | RapidAPI host. Default `jsearch.p.rapidapi.com`. |
| `JSEARCH_COUNTRY` | No | Country code. Default `in`. |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Optional | Enables Adzuna as a secondary source. |
| `ADZUNA_COUNTRY` | No | Adzuna country code. Default `in`. |
| `DISCOVERY_DAILY_LIMIT` | No | Maximum discovery searches in a rolling 24 hours. Default `40`. |
| `DISCOVERY_MAX_AGE_DAYS` | No | Reject source results older than this. Default `45`. |
| `GEMINI_API_KEY` | Optional | Enables AI analysis and discovery enrichment. |
| `GEMINI_MODEL` | No | Gemini model. Default `gemini-2.5-flash`. |
| `APP_PASSWORD` | Production | Enables the committee password gate. Leave blank for local development. |
| `AUTH_SECRET` | With `APP_PASSWORD` | Random signing secret, at least 32 characters. Required in production when auth is enabled. |
| `SESSION_TTL_HOURS` | No | Session lifetime. Default `12`. |

The frontend reads one optional build-time variable:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL, including `/api`, for split frontend/backend deployments. Leave unset for same-origin serving or the Vite proxy. |

## Database

### Local development store

With no Supabase credentials, the backend uses a JSON store. This is convenient for development, but:

- data is not suitable for ephemeral production hosts;
- it is a single-process development fallback, not a concurrent production database.

The file defaults to `backend/data/local-db.json` and is git-ignored.

### Supabase PostgreSQL

1. Create a Supabase project.
2. Run [`database/migrations/001_initial_schema.sql`](database/migrations/001_initial_schema.sql) in the Supabase SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`.
4. Restart the backend and confirm `GET /api/health` reports `"databaseMode":"supabase"`.

The migration enables Row Level Security on all application tables. The browser never connects directly to Supabase; Express uses the service role key server-side. Writes are intentionally not available through Supabase client policies.

## Discovery and verification rules

### Discovery

- Cities are queried separately in committee priority order: **Gurugram → Noida → Delhi → Faridabad**.
- The 16 target keywords cover Web Development, Data Analytics, AI/ML/GenAI, Cybersecurity, Software Engineering, Cloud/DevOps, Technical Operations, and Business Operations.
- Category targets total 20: Web Dev 5, Data Analytics 4, AI/ML/GenAI 4, Cybersecurity 2, Software Engineering 2, Cloud/DevOps 1, Technical Ops 1, Business Ops 1.
- JSearch is the primary source. Adzuna is optional and appears disabled until credentials are configured.
- Duplicate results are refreshed where safe rather than inserted twice.
- Invalid records are rejected with a reason such as `outside_ncr`, `not_internship`, `missing_company`, `expired`, or `stale`.
- The rolling 24-hour discovery quota prevents accidental API overuse.

If no provider keys are configured, live discovery is disabled by design. Use **Add manually** to add a record from an employer page. No sample or fabricated jobs are inserted automatically.

### Verification

Records move through these statuses:

| Status | Meaning |
| --- | --- |
| `pending` | Newly imported or manually added; awaiting review. |
| `verified_active` | Reviewed against the original posting and confirmed live. Counts toward the target. |
| `needs_review` | Retained in the queue for another reviewer or more evidence. |
| `expired` | Deadline passed, listing closed, or no longer active. |
| `rejected` | Invalid, irrelevant, fraudulent, or otherwise unsuitable. |

Only `verified_active` with `is_active = true` counts toward the target. The application does not auto-verify API results.

Link checks:

- run server-side;
- resolve DNS and block private, loopback, link-local, metadata, and other unsafe addresses;
- follow a limited number of redirects;
- report reachable, blocked, rate-limited, not-found, error, or unreachable outcomes;
- never replace the reviewer's judgement.

## Reports

The report builder can export:

- **Verified opportunities** — only currently verified active records;
- **Full directory** — all records with their verification status.

Formats:

- **XLSX** — an Opportunities sheet plus a Summary sheet with target and coverage breakdowns;
- **PDF** — a committee cover summary and formatted opportunity table with clickable application links.

Every generated file is recorded in report history with type, format, scope, record count, preparer, and filters. PDF/XLSX generation happens in the browser, so API keys and raw provider responses are never sent to the report layer.

## API overview

All responses use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "…", "details": [] } }
```

Unauthenticated routes: `/api/health`, `/api/auth/*`. When `APP_PASSWORD` is set, all other `/api/*` routes require a Bearer session token.

| Area | Endpoints |
| --- | --- |
| System | `GET /api/health`, `GET /api/system/config`, `GET /api/system/status`, `POST /api/system/reindex-companies` |
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Dashboard | `GET /api/dashboard?scope=all|verified` |
| Jobs | `GET /api/jobs`, `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/analyze`, `POST /api/jobs/analyze-pending`, `POST /api/jobs/:id/save`, `DELETE /api/jobs/:id/save` |
| Discovery | `POST /api/discover/search`, `GET /api/discover/history`, `GET /api/discover/usage` |
| Verification | `GET /api/verification/queue`, `GET /api/verification/logs`, `POST /api/verification/:id/check-link`, `POST /api/verification/:id/verify` |
| Companies | `GET /api/companies`, `GET /api/companies/:id` |
| Reports | `GET /api/reports/summary`, `GET /api/reports/history`, `POST /api/reports` |

## Testing

```bash
npm test
```

The backend suite covers:

- JSearch, Adzuna, and manual normalisation/rejection rules;
- duplicate detection by source ID, URL, and fingerprint;
- dashboard, company, and report analytics;
- API health/config, directory filters, manual entry, verification safeguards and audit logging, shortlist operations, SSRF protection, and report history.

The test suite uses an isolated temporary JSON store and never touches development data.

For a production build check:

```bash
npm run build
```

## Deployment

### Recommended: one Render web service

This is the simplest deployment because Express serves both the API and the built frontend.

1. Create a **Web Service** from the repository.
2. Build command:

   ```bash
   npm install --legacy-peer-deps && npm run build
   ```

3. Start command:

   ```bash
   npm start
   ```

4. Health check path: `/api/health`.
5. Set environment variables:
   - `NODE_ENV=production`
   - `APP_PASSWORD` and a 32+ character `AUTH_SECRET`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - provider keys as required
   - `ALLOWED_ORIGINS` if any additional browser origin needs API access
6. Run the Supabase migration before the first production start.

Do **not** rely on the local JSON store on an ephemeral host. Use Supabase for persistent production data.

### Split frontend on Vercel + backend on Render

1. Deploy the backend to Render using the steps above.
2. Add the Vercel production origin to `ALLOWED_ORIGINS` on Render, for example:

   ```dotenv
   ALLOWED_ORIGINS=https://ncr-internship-finder.vercel.app
   ```

3. Deploy the repository to Vercel with:
   - build command: `npm run build --workspace frontend`
   - output directory: `frontend/dist`
   - environment variable: `VITE_API_URL=https://your-api.onrender.com/api`
4. Rebuild the frontend whenever `VITE_API_URL` changes, because Vite inlines build-time variables.

Same-origin requests are automatically accepted when the browser's `Origin` host matches the API host, so the single-service deployment does not need its own public URL pre-registered in CORS.

## Security notes

- Provider and Gemini keys are read only by the backend.
- Helmet sets security headers; CORS is allow-listed (with same-origin detection).
- Manual URLs and link checks are normalised; the link checker blocks private network targets and metadata services.
- Rate limits apply to API reads, discovery, AI analysis, writes, and login.
- The optional session is an HMAC-signed bearer token stored in browser local storage. Use HTTPS in production.
- `APP_PASSWORD` is required in production unless `ALLOW_PUBLIC_ACCESS=true` is deliberately set for a public demo.
- `AUTH_SECRET` must be at least 32 random characters when auth is used in production.

## Troubleshooting

### `npm install` fails in npm arborist

Use:

```bash
npm install --legacy-peer-deps
```

Delete `node_modules` and the lockfile only if you understand the dependency change; the SheetJS tarball is intentional.

### Browser cannot reach the API

- Confirm `http://localhost:4000/api/health` is healthy.
- For split deployment, confirm `VITE_API_URL` points to the backend and includes `/api`.
- Add the frontend origin to `ALLOWED_ORIGINS` and restart/redeploy the backend.
- CORS does not apply to same-origin deployments served by Express.

### Discovery says a provider is not configured

Add the relevant key to `backend/.env` and restart the backend. Keys are read at process start. Gemini analysis also stays disabled until configured.

### Login loop or `AUTH_SECRET` error

In production, set both `APP_PASSWORD` and a unique `AUTH_SECRET` of at least 32 characters. A blank or ephemeral secret invalidates existing sessions when the process restarts.

### Local data disappeared after redeploy

The local JSON store is not production persistence. Configure Supabase and rerun the schema migration.

## Status

This repository is a functional committee platform. Live discovery, AI analysis, and Supabase persistence require the corresponding credentials. Without them, the system still supports manual opportunity entry, verification, company tracking, reporting, settings, and local development.
