require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const cookieParser = require('cookie-parser');
const path         = require('path');
const migrate      = require('./src/migrate');
const { requireAuth, requireRole } = require('./src/middleware/auth');
const { startCronJobs } = require('./src/jobs/cron');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave:            false,
  saveUninitialized: false,
  cookie: { maxAge: 8*60*60*1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' },
}));

app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use(require('./src/routes/auth'));
app.use(require('./src/routes/user'));
app.use(require('./src/routes/attendance'));
app.use(require('./src/routes/corrections'));
app.use(require('./src/routes/hod'));
app.use(require('./src/routes/hrSync'));

// Page routes
const pages = [
  { path: '/dashboard',     file: 'dashboard.html',     roles: null },
  { path: '/my-attendance', file: 'my-attendance.html', roles: null },
  { path: '/my-requests',   file: 'my-requests.html',   roles: null },
  { path: '/hod/approvals', file: 'hod-approvals.html', roles: ['HOD','HR','ADMIN'] },
  { path: '/hod/team',      file: 'hod-team.html',      roles: ['HOD','HR','ADMIN'] },
  { path: '/hod/history',   file: 'hod-history.html',   roles: ['HOD','HR','ADMIN'] },
  { path: '/hr/sync',       file: 'hr-sync.html',       roles: ['HR','ADMIN'] },
];
pages.forEach(({ path: p, file, roles }) => {
  const guards = roles ? [requireAuth, requireRole(...roles)] : [requireAuth];
  app.get(p, ...guards, (req, res) => res.sendFile(file, { root: path.join(__dirname, 'public') }));
});

app.get('/', (req, res) => res.redirect(req.session?.userId ? '/dashboard' : '/login'));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error.' }); });

async function start() {
  try {
    await migrate();

    // Auto-seed demo data if DB is empty
    const db = require('./src/db');
    const [{ count }] = await db('users').count('id as count');
    if (parseInt(count) === 0) {
      console.log('Empty DB — seeding demo data…');
      const bcrypt = require('bcryptjs');
      const hash = pw => bcrypt.hashSync(pw, 10);

      const [hod] = await db('users').insert({ name:'Faizul Hisham', email:'hod@mrdiy.com', password:hash('hod123'), staff_id:'M-00100', department:'Retail Operations', role:'HOD' }).returning('*');
      const [e1]  = await db('users').insert({ name:'Ahmad Razif',   email:'employee@mrdiy.com',  password:hash('emp123'), staff_id:'E-04291', department:'Retail Operations', role:'EMPLOYEE', hod_id:hod.id }).returning('*');
      await db('users').insert([
        { name:'Nurul Ain',    email:'employee2@mrdiy.com', password:hash('emp123'), staff_id:'E-04287', department:'Retail Operations', role:'EMPLOYEE', hod_id:hod.id },
        { name:'Siti Rahimah', email:'employee3@mrdiy.com', password:hash('emp123'), staff_id:'E-04318', department:'Retail Operations', role:'EMPLOYEE', hod_id:hod.id },
        { name:'HR Admin',     email:'hr@mrdiy.com',        password:hash('hr123'),  staff_id:'HR-001',  department:'Human Resources',   role:'HR' },
      ]);

      // Seed attendance (simulating HR system import)
      const week = [
        { date:'2026-10-06', clock_in:'08:54:00', clock_out:'18:02:00' },
        { date:'2026-10-07', clock_in:'09:12:00', clock_out:'17:55:00' },
        { date:'2026-10-08', clock_in:'08:47:00', clock_out:'18:30:00' },
        { date:'2026-10-09', clock_in:'08:50:00', clock_out:null },
        { date:'2026-10-10', clock_in:'09:01:00', clock_out:'17:45:00' },
      ];
      for (const row of week) {
        await db('attendance').insert({ user_id:e1.id, source:'HR_SYSTEM', synced_at:new Date(), hr_record_id:`BIO-${e1.staff_id}-${row.date}`, ...row }).onConflict(['user_id','date']).ignore();
      }

      // Missing-record notification for Ahmad — seeded as unread so employee sees it once
      await db('notifications').insert({ user_id:e1.id, type:'missing_record', is_read:false, title:'Missing clock-out detected', message:'Your clock-out was not recorded for Thursday, 9 October 2026. Please submit a correction within 48 hours.' });

      console.log('✅ Demo data seeded.');
    }

    app.listen(PORT, () => {
      console.log(`
  ┌───────────────────────────────────────────────────────┐
  │   AttendFix v3 — MR DIY HR Attendance System          │
  │                                                       │
  │   http://localhost:${PORT}                                │
  │                                                       │
  │   Flow: HR system → AttendFix → detect missing        │
  │         → employee notified → HOD approves            │
  │         → auto-fill + write back to HR system         │
  │                                                       │
  │   HR Adapter: ${(process.env.HR_ADAPTER||'mock').toUpperCase().padEnd(10)} (set in .env)         │
  │                                                       │
  │   employee@mrdiy.com  /  emp123                       │
  │   hod@mrdiy.com       /  hod123                       │
  │   hr@mrdiy.com        /  hr123                        │
  └───────────────────────────────────────────────────────┘`);
      startCronJobs();
    });
  } catch (e) {
    console.error('\n❌ Startup failed:', e.message);
    if (e.message.includes('ECONNREFUSED'))
      console.error('→ PostgreSQL is not running. Start it from Windows Services or pgAdmin.');
    else if (e.message.includes('ENOTFOUND'))
      console.error('→ Hostname not found.\n  If using Supabase: use the Transaction pooler URL (port 6543),\n  not the direct connection URL (port 5432). See SETUP.md.');
    else if (e.message.includes('password authentication'))
      console.error('→ Wrong database password. Check DATABASE_URL in .env');
    else if (e.message.includes('does not exist'))
      console.error('→ Database not found. Check DATABASE_URL in .env');
    else
      console.error('→ Check DATABASE_URL in .env and make sure PostgreSQL is running.');
    process.exit(1);
  }
}

start();
