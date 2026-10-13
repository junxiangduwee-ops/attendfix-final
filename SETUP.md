# AttendFix v3 — Complete Setup Guide

---

## Step 1 — Create the PostgreSQL database

Open pgAdmin (installed with PostgreSQL) or the psql terminal:

```sql
CREATE DATABASE attendfix;
```

That's all. AttendFix creates the tables itself on first run.

---

## Step 2 — Configure .env

Open the `.env` file in the project folder and update these values:

```env
# Required — your PostgreSQL connection (see options below)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendfix

# Required — any long random string (just mash the keyboard)
SESSION_SECRET=kj3h5kj2h34kjh23k4jh23k4jh2k3j4h2k3j4h

# Optional — leave blank if you don't have SMTP yet
# The app works fine without email; notifications still appear in-app
SMTP_HOST=smtp.mrdiy.com
SMTP_PORT=587
SMTP_USER=no-reply@mrdiy.com
SMTP_PASS=your_smtp_password

# HR adapter — keep as 'mock' until your HR system is ready
HR_ADAPTER=mock
```

**If using local PostgreSQL:**
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendfix
```
Default username is `postgres`, port is `5432`.

**If using Supabase:**

⚠️ Supabase gives you two connection strings — you must use the **Transaction pooler**, not the direct connection. The direct connection (`db.xxxx.supabase.co:5432`) only works from servers with a fixed IP, not from a local machine.

1. Go to your Supabase dashboard
2. Click **Settings** (gear icon) → **Database**
3. Scroll to **Connection string**
4. Select **Transaction pooler** (not "Direct connection")
5. Copy the string — it looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
6. Paste it as `DATABASE_URL` in your `.env` and replace `YOUR_PASSWORD` with your Supabase database password

The key differences:
- Pooler host: `aws-0-ap-southeast-1.pooler.supabase.com` (not `db.xxxx.supabase.co`)
- Pooler port: `6543` (not `5432`)

**If using Supabase you do NOT need to create a database** — the `postgres` database is already there. Just run `npm run db:migrate` and `npm run db:seed` after configuring the URL.

---

## Step 3 — Install dependencies

```bash
npm install
```

No Visual Studio, no compilers needed. All pure JavaScript.

---

## Step 4 — Start the app

```bash
npm start
```

On first run you will see:
```
✅ Migrations complete.
Demo data seeded.
[HR ADAPTER] Mode: MOCK (demo data)
⏰  Cron jobs started (KL timezone):
    HR pull:          0 1 * * 1-6
    Missing detect:   45 23 * * 1-6
    Retry HR push:    every 2 hours
    Employee sync:    Sundays 02:00

  ┌──────────────────────────────────────────────────────┐
  │   AttendFix v3 — MR DIY HR Attendance System         │
  │   http://localhost:3000                              │
  └──────────────────────────────────────────────────────┘
```

Open http://localhost:3000 in your browser.

---

## Step 5 — Log in and verify

| Role     | Email               | Password |
|----------|---------------------|----------|
| Employee | employee@mrdiy.com  | emp123   |
| HOD      | hod@mrdiy.com       | hod123   |
| HR Admin | hr@mrdiy.com        | hr123    |

---

## Step 6 — Test the full workflow

Since `HR_ADAPTER=mock`, the HR system is simulated. Use the HR Sync page to trigger everything manually:

1. Log in as **hr@mrdiy.com** → go to **HR Sync**
2. Click **Pull now** — imports attendance from the mock HR system
3. Click **Detect now** — scans for missing records and notifies employees
4. Log in as **employee@mrdiy.com** → Dashboard should show a missing record alert
5. Click **Submit correction** → fill in justification + proposed time → submit
6. Log in as **hod@mrdiy.com** → Pending Approvals → Approve or Reject
7. Log back in as employee → see the result

---

## Cron jobs — do they need anything extra?

No. Cron starts automatically when the server starts (`npm start`). You will see the schedule printed in the terminal. As long as the server is running, cron runs.

**Default schedule (all KL timezone, Mon–Sat):**

| Job | When | What it does |
|---|---|---|
| HR pull | 01:00 daily | Fetches yesterday's attendance from HR system |
| Missing detection | 23:45 daily | Finds gaps, notifies employee + HOD |
| Retry failed push-backs | Every 2 hours | Re-attempts corrections that failed to write to HR |
| Employee roster sync | Sunday 02:00 | Pulls employee list from HR |

**To change the schedule**, edit `.env`:
```env
HR_SYNC_SCHEDULE=0 1 * * 1-6
MISSING_DETECT_SCHEDULE=45 23 * * 1-6
```
Uses standard cron syntax. Restart the server after changing.

---

## Common errors

**`Error: connect ECONNREFUSED 127.0.0.1:5432`**
→ PostgreSQL is not running. Open Services on Windows and start `postgresql-x64-14` (or whichever version you have).

**`Error: password authentication failed`**
→ Wrong password in DATABASE_URL. Check what password you set when installing PostgreSQL.

**`Error: database "attendfix" does not exist`**
→ You haven't created the database yet. Run `CREATE DATABASE attendfix;` in pgAdmin.

**`npm error code 1` during npm install**
→ Make sure you downloaded the v3 zip, not v1/v2. v3 uses only pure-JS packages.

---

## Database scripts

All database management is done through npm scripts — no SQL, no pgAdmin needed.

| Command | What it does |
|---|---|
| `npm run db:migrate` | Creates all tables. Safe — never drops or wipes existing data. |
| `npm run db:seed` | Inserts demo accounts and sample attendance. Skips if users already exist. |
| `npm run db:reset` | ⚠️ Drops all tables, re-creates them, re-seeds demo data. Full fresh start. |
| `npm run db:status` | Shows how many rows are in each table. Useful for checking state. |

**To reset and start fresh (no pgAdmin needed):**
```bash
npm run db:reset
```

**To just check what's in the DB:**
```bash
npm run db:status
```

Output looks like:
```
  Table                  Rows
  ─────────────────────────────
  users                  5
  attendance             15
  correction_requests    2
  notifications          8
  hr_sync_log            4
  audit_logs             12
```

---

## Going to production (when ready)

1. Set `NODE_ENV=production` in `.env`
2. Set a strong `SESSION_SECRET` (32+ random characters)
3. Set `APP_URL` to your real domain
4. Configure SMTP for real emails
5. Set `HR_ADAPTER=api` and implement the 3 functions in `src/integrations/hrAdapter.js`
6. Run behind a reverse proxy (nginx) with HTTPS

