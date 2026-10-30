# Campus OS

Campus OS is a multi-university campus platform for students, faculty, institution administrators, and platform administrators. It includes role-based dashboards, timetables, assignments, attendance, campus announcements and events, learning resources, and career opportunities.

**Stack:** React + Vite · Node.js + Express · MySQL 8+

## Project structure

```text
campus-os/
├── frontend/    React app
├── backend/     Express API and operator scripts
├── database/    Fresh-install schema and additive migrations
└── README.md
```

## Setup

### 1. Database

Install and start MySQL 8+. To create a **fresh development database** with sample accounts and data:

```bash
mysql -u root -p --default-character-set=utf8mb4 < database/schema.sql
```

`schema.sql` drops and recreates `campus_os`. Do not run it against a database whose data you need to keep.

For an existing database created from an earlier version, apply each migration that has not already been applied, in this order. The migrations are one-time changes and are not safe to rerun:

```bash
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261020_admin_profiles.sql
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261020_02_account_approval.sql
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261020_03_content_visibility.sql
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261020_04_complete_academic_and_verification.sql
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261020_05_platform_administration.sql
mysql -u root -p --default-character-set=utf8mb4 < database/migrations/20261021_06_academic_calendar.sql
```

The first three migrations add institution admin profiles, signup approval, and content sharing. Migration 04 adds programs, class sections, section-specific subject offerings, audience and program eligibility, and the identity verification roster. Migration 05 adds the platform administrator role. Migration 06 adds institution-scoped academic calendar entries. Existing student program names are migrated into structured program records and their current classes are assigned to section A.

### 2. Backend

From the repository root:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with the local MySQL settings and a private `JWT_SECRET` of at least 32 characters, then run:

```bash
npm install
npm run dev
```

The API health check is [http://localhost:5001/api/health](http://localhost:5001/api/health).

### 3. Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite uses `http://localhost:5001/api` by default. Set `VITE_API_URL` in `frontend/.env` to override it.

## Deploying the frontend to Netlify

The repository's `netlify.toml` configures Netlify to build the Vite app from `frontend/` and publish `frontend/dist`. It also routes client-side pages back through `index.html`.

The frontend is only one part of Campus OS. Netlify hosts the static site; deploy the Express API and a MySQL database separately. The API must be reachable over HTTPS, and its database must be reachable from the API host. Do not put database credentials or JWT secrets in Netlify's frontend environment variables: Vite `VITE_` variables are included in the browser bundle.

When configuring the Netlify site, add the build environment variable `VITE_API_URL` with the public API base URL, ending in `/api` (for example, `https://api.example.com/api`). Rebuild after changing it. On the API host, configure its database credentials, a private `JWT_SECRET` of at least 32 characters, and `CORS_ORIGIN` equal to the deployed Netlify site origin (for example, `https://example.netlify.app`). Set `NODE_ENV=production`.

Faculty resource uploads currently use the API server's local `backend/uploads` directory. A production API host needs persistent storage for these files, such as a persistent disk or object storage, or uploaded files may be lost when the service restarts or redeploys.

## Roles and onboarding

### Platform administrator

Platform administrators are trusted operators who create institutions and the first administrator for each institution. After applying migration 05, provision the initial platform administrator from `backend/`:

```bash
npm run platform-admin:create
```

Sign into the app with that account. The platform dashboard creates a university, its first college and department, and its first institution administrator in one transaction. There is no public signup for platform admins.

### Institution administrator

The platform administrator supplies the first institution admin login. Existing operators can also provision an institution admin for an existing university with:

```bash
npm run admin:create
```

An institution administrator signs in to manage colleges, departments, programs, class sections, subjects, section-specific subject offerings, faculty assignments, timetable entries, account approvals, and published content. Admin scope is limited to the admin's university.

### Verified student and faculty signup

Before signup is enabled, an institution admin creates academic programs and class sections, then adds the official identity to the **Affiliation roster**. The admin gets a one-time invite code to deliver securely to that person. The roster includes the institution email and ID; a student's program and class placement are also specified there. During signup, the applicant's university, department, email, official ID, and invite code must match an unused roster entry. Academic placement is taken from the roster, not from user-entered fields. New accounts remain pending until the institution administrator approves them. Roster identities and invite codes can only be claimed once.

Students are enrolled in subjects through subject offerings assigned to their class section. Faculty are assigned to subjects by the institution administrator.

### Development sample accounts

`schema.sql` includes demo student and faculty accounts (password `Campus@123`) for local development. They are active sample records and do not represent verified production identities. Remove sample data before a real deployment.

## Sharing and eligibility

Admins can publish events, resources, and opportunities with an audience (everyone, students, or faculty), an optional eligible program, and university-only or cross-campus visibility. Read endpoints, event registration, and save/favourite actions enforce the same audience and program rules. Opportunities are available to students. Cross-campus visibility exposes content to other Campus OS institutions; program restrictions refer to a specific institution's program record.

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
| POST | `/api/platform/institutions` | Create a university, first college, department, and institution admin (platform admin only) |

Other routes for attendance, assignments, timetables, announcements, faculty tools, and content publishing are defined in `backend/server.js` and used by the frontend service layer in `frontend/src/services/api.js`.

## Current limitations

- Roster matching verifies that an institution administrator pre-authorized an email and official ID, then issued a single-use code. It is not a live connection to a university SIS, SSO provider, or government identity service.
- Account password changes and password recovery are not yet implemented in the user interface.
- The MySQL migrations are manual and one-time; track which ones have been applied to each database.
- Cross-campus content is visible to all Campus OS institutions when its audience/program rules permit it. Per-partner institution allowlists are not implemented.
