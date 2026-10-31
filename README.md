# Campus OS

Campus OS is a multi-university campus platform for students, faculty, institution administrators, and platform administrators. It includes role-based dashboards, timetables, assignments, attendance, campus announcements and events, learning resources, and career opportunities.

**Stack:** React + Vite · Node.js + Express · PostgreSQL on Supabase

## Project structure

```text
campus-os/
├── frontend/    React app
├── backend/     Express API and operator scripts
├── database/    PostgreSQL schema and migrations
└── README.md
```

## Setup

### 1. Create the Supabase database

Create a Supabase project, open **SQL Editor**, and run `database/schema.sql` once in a new, empty project. The schema creates the tables, enables row-level security, and adds starter university, college, and department directory records. It does not create or drop the Supabase database.

`database/supabase_schema.sql` contains the same fresh-install schema. Do not run both schema files. For an existing PostgreSQL database with the original Campus OS base tables, use the incremental PostgreSQL scripts in `database/migrations/` in filename order instead. Do not run those migrations after either full schema file.

The old MySQL schema is retained as `database/mysql_schema_legacy.sql` for reference only. Do not run it in Supabase. Existing MySQL user data is not automatically copied; importing it requires a separate data migration.

### 2. Configure and start the backend

From the repository root:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set `DATABASE_URL` in `backend/.env` to the PostgreSQL connection string from your Supabase project's **Connect** dialog. Replace its password placeholder locally. Use the exact connection mode and host Supabase provides; do not use the project `https://...supabase.co` API URL as `DATABASE_URL`.

Also set a private `JWT_SECRET` of at least 32 characters. Keep `DATABASE_URL` and `JWT_SECRET` on the backend host only. The app continues to authenticate through its Express API; it does not use Supabase Auth or a browser Supabase client. Never put a database password or service/secret API key in a `VITE_` variable.

The API health check is [http://localhost:5001/api/health](http://localhost:5001/api/health).

### 3. Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite uses `http://localhost:5001/api` by default. Set `VITE_API_URL` in `frontend/.env` to override it.

## Development demo accounts

To create the three development accounts shown on the login page, run this from `backend/` after applying the schema:

```bash
npm run seed:demo
```

The demo password is `Campus@123`. The command also creates their program/section links, subject enrollments, and the faculty timetable. The script refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_ACCOUNTS=true` is explicitly set. Do not enable demo accounts on a public production site.

## Initial administrator setup

The full schema does not create demo login accounts or a platform administrator. After the backend is connected, create the first platform administrator from `backend/`:

```bash
npm run platform-admin:create
```

Sign in with that account to create an institution and its first institution administrator. Institution admins can then set up departments, academic programs, class sections, roster entries, subjects, and faculty assignments. There is no public signup for administrator roles.

## Deploying the frontend to Netlify

`netlify.toml` builds the Vite app from `frontend/` and publishes `frontend/dist`. Netlify hosts only the static frontend; deploy the Express API separately to a Node.js host that can reach Supabase PostgreSQL.

Set Netlify's `VITE_API_URL` to the public HTTPS API base URL ending in `/api` (for example, `https://api.example.com/api`). On the backend host, set `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, and `CORS_ORIGIN` to the exact Netlify site origin. Do not put database credentials, JWT secrets, or Supabase secret keys in Netlify's frontend variables. Vite embeds `VITE_` variables in browser assets.

Faculty resource uploads currently use the API server's local `backend/uploads` directory. A production API host needs persistent storage, such as a persistent disk or object storage, or uploaded files may be lost when the service restarts or redeploys.

## Verified student and faculty signup

Before student or faculty signup can complete, an institution admin adds the official identity to the affiliation roster and issues a single-use invite code. The roster email and institutional ID must match at signup. New accounts remain pending until the institution administrator approves them. Roster identities and invite codes can only be claimed once.

Students are enrolled in subjects through subject offerings assigned to their class section. Faculty are assigned to subjects by the institution administrator.

## Main API routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | API and database health |
| GET | `/api/auth/directory` | Public university, college, and department signup choices |
| POST | `/api/auth/signup` | Signup matched against an institution roster |
| POST | `/api/auth/login` | Sign in active accounts |
| GET | `/api/dashboard` | Student dashboard |
| GET / PATCH | `/api/profile` | Read/update personal profile fields |
| GET | `/api/events`, `/api/resources`, `/api/career` | Audience- and visibility-filtered content |
| GET | `/api/calendar` | University academic dates visible to the signed-in audience |
| POST / DELETE | `/api/admin/calendar` | Create or remove institution academic dates |
| GET | `/api/admin/overview` | Institution structure, offerings, timetable, and content |
| POST | `/api/admin/colleges`, `/api/admin/departments` | Add colleges and departments |
| POST | `/api/admin/programs`, `/api/admin/sections` | Add programs and class sections |
| POST | `/api/admin/subjects`, `/api/admin/offerings` | Add subjects and assign them to class sections |
| POST / GET | `/api/admin/roster` | Add/list institution-verified identities |
| GET | `/api/admin/pending-users` | Review signup requests |
| POST | `/api/platform/institutions` | Create an institution and its first administrator |

Other routes for attendance, assignments, timetables, announcements, faculty tools, and content publishing are defined in `backend/server.js` and used by the frontend service layer in `frontend/src/services/api.js`.

## Current limitations

- Roster matching verifies that an institution administrator pre-authorized an email and official ID and issued a single-use code. It is not a live connection to a university SIS, SSO provider, or government identity service.
- Account password changes and password recovery are not yet implemented in the user interface.
- Incremental PostgreSQL migrations are intended for an existing base schema. For a fresh project, use the full schema once and keep the migrations under source control for later upgrades.
- Cross-campus content is visible to all Campus OS institutions when its audience/program rules permit it. Per-partner institution allowlists are not implemented.
