require('dotenv').config();
const express      = require('express');

async function seedUsers(db) {
  const bcrypt = require('bcryptjs');
  const hash   = pw => bcrypt.hashSync(pw, 10);

  // ── System accounts ───────────────────────────────────────────────────────
  await db('users').insert({ name:'HR Admin', email:'hr@mrdiy.com', password:hash('hr123'), staff_id:'HR-001', department:'Human Resources', role:'HR' });

  // ── Departments & HODs ────────────────────────────────────────────────────
  const depts = [
    { dept:'Operations',      name:'Rashid Hamdan',     email:'hod@mrdiy.com',     staff_id:'H-00101', pw:'hod123' },
    { dept:'Retail',          name:'Fauziah Ismail',    email:'fauziah.ismail@mrdiy.com',    staff_id:'H-00102', pw:'hod123' },
    { dept:'Logistics',       name:'Zulkifli Nordin',   email:'zulkifli.nordin@mrdiy.com',   staff_id:'H-00103', pw:'hod123' },
    { dept:'Finance',         name:'Lim Bee Ching',     email:'lim.beeching@mrdiy.com',      staff_id:'H-00104', pw:'hod123' },
    { dept:'Human Resources', name:'Priya Subramaniam', email:'priya.subramaniam@mrdiy.com', staff_id:'H-00105', pw:'hod123' },
  ];

  const hodMap = {};
  for (const d of depts) {
    const [hod] = await db('users').insert({ name:d.name, email:d.email, password:hash(d.pw), staff_id:d.staff_id, department:d.dept, role:'HOD' }).returning('*');
    hodMap[d.dept] = hod.id;
  }

  // ── Employees (6 per dept = 30 total) ────────────────────────────────────
  const employees = [
    // Operations
    { name:'Ahmad Razif Bin Bakar',   email:'ahmad.razif@mrdiy.com',    staff_id:'E-04291', dept:'Operations',      pw:'emp123' },
    { name:'Mohd Hafiz Bin Yusof',    email:'employee@mrdiy.com',     staff_id:'E-04292', dept:'Operations',      pw:'emp123' },
    { name:'Nurul Huda Bt Ramlan',    email:'nurul.huda@mrdiy.com',     staff_id:'E-04293', dept:'Operations',      pw:'emp123' },
    { name:'Azri Bin Othman',         email:'azri.othman@mrdiy.com',    staff_id:'E-04294', dept:'Operations',      pw:'emp123' },
    { name:'Saleha Bt Zainal',        email:'saleha.zainal@mrdiy.com',  staff_id:'E-04295', dept:'Operations',      pw:'emp123' },
    { name:'Firdaus Bin Kassim',      email:'firdaus.kassim@mrdiy.com', staff_id:'E-04296', dept:'Operations',      pw:'emp123' },
    // Retail
    { name:'Nurul Ain Bt Hamid',      email:'nurul.ain@mrdiy.com',      staff_id:'E-04287', dept:'Retail',          pw:'emp123' },
    { name:'Kavitha Rajasekaran',     email:'kavitha.raja@mrdiy.com',   staff_id:'E-04288', dept:'Retail',          pw:'emp123' },
    { name:'Tan Wei Liang',           email:'tan.weiliang@mrdiy.com',   staff_id:'E-04289', dept:'Retail',          pw:'emp123' },
    { name:'Norashikin Bt Musa',      email:'norashikin.musa@mrdiy.com',staff_id:'E-04290', dept:'Retail',          pw:'emp123' },
    { name:'Rajendran Pillai',        email:'rajendran.p@mrdiy.com',    staff_id:'E-04281', dept:'Retail',          pw:'emp123' },
    { name:'Wong Mei Ling',           email:'wong.meiling@mrdiy.com',   staff_id:'E-04282', dept:'Retail',          pw:'emp123' },
    // Logistics
    { name:'Siti Rahimah Bt Alias',   email:'siti.rahimah@mrdiy.com',   staff_id:'E-04318', dept:'Logistics',       pw:'emp123' },
    { name:'Hairul Azwan Bin Daud',   email:'hairul.azwan@mrdiy.com',   staff_id:'E-04319', dept:'Logistics',       pw:'emp123' },
    { name:'Rosnah Bt Ibrahim',       email:'rosnah.ibrahim@mrdiy.com', staff_id:'E-04320', dept:'Logistics',       pw:'emp123' },
    { name:'Syafiq Bin Zamri',        email:'syafiq.zamri@mrdiy.com',   staff_id:'E-04321', dept:'Logistics',       pw:'emp123' },
    { name:'Chong Kok Wai',           email:'chong.kokwai@mrdiy.com',   staff_id:'E-04322', dept:'Logistics',       pw:'emp123' },
    { name:'Munirah Bt Saari',        email:'munirah.saari@mrdiy.com',  staff_id:'E-04323', dept:'Logistics',       pw:'emp123' },
    // Finance
    { name:'Noraini Bt Mansor',       email:'noraini.mansor@mrdiy.com', staff_id:'E-04340', dept:'Finance',         pw:'emp123' },
    { name:'Arif Bin Zainudin',       email:'arif.zainudin@mrdiy.com',  staff_id:'E-04341', dept:'Finance',         pw:'emp123' },
    { name:'Stella Ong Hui Yin',      email:'stella.ong@mrdiy.com',     staff_id:'E-04342', dept:'Finance',         pw:'emp123' },
    { name:'Mohd Amirul Bin Salleh',  email:'mohd.amirul@mrdiy.com',    staff_id:'E-04343', dept:'Finance',         pw:'emp123' },
    { name:'Dayang Norfazlina',       email:'dayang.norfaz@mrdiy.com',  staff_id:'E-04344', dept:'Finance',         pw:'emp123' },
    { name:'Suresh Kumar A/L Raman',  email:'suresh.kumar@mrdiy.com',   staff_id:'E-04345', dept:'Finance',         pw:'emp123' },
    // Human Resources
    { name:'Zarina Bt Ghazali',       email:'zarina.ghazali@mrdiy.com', staff_id:'E-04360', dept:'Human Resources', pw:'emp123' },
    { name:'Hafizuddin Bin Razali',   email:'hafizuddin.r@mrdiy.com',   staff_id:'E-04361', dept:'Human Resources', pw:'emp123' },
    { name:'Umi Kalthum Bt Bahari',   email:'umi.kalthum@mrdiy.com',    staff_id:'E-04362', dept:'Human Resources', pw:'emp123' },
    { name:'Ng Boon Keong',           email:'ng.boonkeong@mrdiy.com',   staff_id:'E-04363', dept:'Human Resources', pw:'emp123' },
    { name:'Asmah Bt Razak',          email:'asmah.razak@mrdiy.com',    staff_id:'E-04364', dept:'Human Resources', pw:'emp123' },
    { name:'Venkatesh A/L Pillai',    email:'venkatesh.p@mrdiy.com',    staff_id:'E-04365', dept:'Human Resources', pw:'emp123' },
  ];

  for (const e of employees) {
    await db('users').insert({ name:e.name, email:e.email, password:hash(e.pw), staff_id:e.staff_id, department:e.dept, role:'EMPLOYEE', hod_id:hodMap[e.dept] });
  }
  console.log(`   ✓ ${depts.length} HODs + ${employees.length} employees + 1 HR Admin`);
}
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
      await seedUsers(db);
      console.log('✅ Demo data seeded. Upload dummy_attendance.xlsx via HR Sync to load attendance.');
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
  │   Any employee        /  emp123                       │
  │   Any HOD             /  hod123                       │
  │   hr@mrdiy.com        /  hr123                        │
  │   e.g. ahmad.razif@mrdiy.com / emp123                 │
  │   e.g. rashid.hamdan@mrdiy.com / hod123               │
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
