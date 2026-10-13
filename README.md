# AttendFix v3 — MR DIY HR Attendance Correction System

## The flow
```
HR system → [sync] → AttendFix detects missing records
  → notifies employee → employee submits justification
  → HOD approves → auto-fill local DB + write back to HR
```

## Prerequisites
- Node.js v18+
- PostgreSQL 14+

## Setup
```bash
# 1. Edit .env — set your PostgreSQL connection string
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/attendfix

# 2. Install and start (auto-migrates + seeds on first run)
npm install
npm start
```

Open http://localhost:3000

## Demo accounts
| Role     | Email               | Password |
|----------|---------------------|----------|
| Employee | employee@mrdiy.com  | emp123   |
| HOD      | hod@mrdiy.com       | hod123   |
| HR Admin | hr@mrdiy.com        | hr123    |

## To reset
Delete all rows or recreate the DB — the server re-seeds on startup when the users table is empty.

## HR system integration
**Currently running in MOCK mode** — generates realistic demo data automatically.

### When your HR system is confirmed:
1. Set `HR_ADAPTER=api` in `.env`
2. Fill in `HR_API_URL` and `HR_API_KEY`
3. Open `src/integrations/hrAdapter.js`
4. Implement the 3 functions (detailed comments inside):
   - `fetchAttendance(date, staffIds)` — pull clock-in/out from HR
   - `pushCorrection(request)` — write approved correction back to HR
   - `syncEmployees()` — pull employee roster from HR

That's it. Nothing else in the app needs to change.

## Cron schedule (KL timezone)
| Job | Schedule |
|---|---|
| Pull from HR | 01:00 Mon–Sat |
| Detect missing records | 23:45 Mon–Sat |
| Retry failed HR push-backs | Every 2 hours |
| Employee roster sync | Sunday 02:00 |

Configure via `HR_SYNC_SCHEDULE` and `MISSING_DETECT_SCHEDULE` in `.env`.

## Manual triggers (HR Admin page)
Log in as hr@mrdiy.com → HR Sync page → trigger any job manually.
