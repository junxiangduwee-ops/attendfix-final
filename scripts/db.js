/**
 * AttendFix — Database management CLI
 * Usage: node scripts/db.js <command>
 *
 * Commands:
 *   migrate   — create all tables (safe, won't drop existing data)
 *   seed      — insert demo data (only if users table is empty)
 *   reset     — drop all tables, re-migrate, re-seed (fresh start)
 *   status    — show table row counts
 */

require('dotenv').config();
const db = require('../src/db');

const command = process.argv[2];

async function migrate() {
  console.log('⏳ Running migrations…');
  await require('../src/migrate')();
}

async function seed() {
  console.log('⏳ Seeding demo data…');
  const bcrypt = require('bcryptjs');
  const hash = pw => bcrypt.hashSync(pw, 10);

  const [{ count }] = await db('users').count('id as count');
  if (parseInt(count) > 0) {
    console.log('⚠️  Users table is not empty — skipping seed.');
    console.log('   Run "npm run db:reset" to wipe and reseed from scratch.');
    return;
  }

  const [hod] = await db('users').insert({
    name: 'Faizul Hisham', email: 'hod@mrdiy.com',
    password: hash('hod123'), staff_id: 'M-00100',
    department: 'Retail Operations', role: 'HOD',
  }).returning('*');

  const [e1] = await db('users').insert({
    name: 'Ahmad Razif', email: 'employee@mrdiy.com',
    password: hash('emp123'), staff_id: 'E-04291',
    department: 'Retail Operations', role: 'EMPLOYEE', hod_id: hod.id,
  }).returning('*');

  const [e2] = await db('users').insert({
    name: 'Nurul Ain', email: 'employee2@mrdiy.com',
    password: hash('emp123'), staff_id: 'E-04287',
    department: 'Retail Operations', role: 'EMPLOYEE', hod_id: hod.id,
  }).returning('*');

  const [e3] = await db('users').insert({
    name: 'Siti Rahimah', email: 'employee3@mrdiy.com',
    password: hash('emp123'), staff_id: 'E-04318',
    department: 'Retail Operations', role: 'EMPLOYEE', hod_id: hod.id,
  }).returning('*');

  await db('users').insert({
    name: 'HR Admin', email: 'hr@mrdiy.com',
    password: hash('hr123'), staff_id: 'HR-001',
    department: 'Human Resources', role: 'HR',
  });

  // Attendance for Ahmad — Thu missing clock-out (simulates HR import)
  const week = [
    { date: '2026-10-06', clock_in: '08:54:00', clock_out: '18:02:00' },
    { date: '2026-10-07', clock_in: '09:12:00', clock_out: '17:55:00' },
    { date: '2026-10-08', clock_in: '08:47:00', clock_out: '18:30:00' },
    { date: '2026-10-09', clock_in: '08:50:00', clock_out: null       },
    { date: '2026-10-10', clock_in: '09:01:00', clock_out: '17:45:00' },
  ];
  for (const row of week) {
    await db('attendance').insert({
      user_id: e1.id, source: 'HR_SYSTEM', synced_at: new Date(),
      hr_record_id: `BIO-${e1.staff_id}-${row.date}`, ...row,
    }).onConflict(['user_id', 'date']).ignore();
  }

  // Full week for Nurul and Siti
  for (const row of week) {
    await db('attendance').insert({ user_id: e2.id, source: 'HR_SYSTEM', synced_at: new Date(), date: row.date, clock_in: '09:00:00', clock_out: '18:00:00' }).onConflict(['user_id','date']).ignore();
    await db('attendance').insert({ user_id: e3.id, source: 'HR_SYSTEM', synced_at: new Date(), date: row.date, clock_in: '08:55:00', clock_out: '17:50:00' }).onConflict(['user_id','date']).ignore();
  }

  // Missing-record notification for Ahmad
  await db('notifications').insert({
    user_id: e1.id, type: 'missing_record', is_read: false,
    title: 'Missing clock-out detected',
    message: 'Your clock-out was not recorded for Thursday, 9 October 2026. Please submit a correction within 48 hours.',
  });

  console.log('✅ Demo data seeded.');
  console.log('');
  console.log('   Demo accounts:');
  console.log('   employee@mrdiy.com  /  emp123  (Employee)');
  console.log('   hod@mrdiy.com       /  hod123  (HOD)');
  console.log('   hr@mrdiy.com        /  hr123   (HR Admin)');
}

async function reset() {
  console.log('⚠️  Dropping all tables…');

  // Drop in reverse dependency order
  const tables = [
    'hr_sync_log',
    'audit_logs',
    'notifications',
    'correction_requests',
    'attendance',
    'users',
  ];

  for (const table of tables) {
    await db.schema.dropTableIfExists(table);
    console.log(`   dropped: ${table}`);
  }

  console.log('');
  await migrate();
  console.log('');
  await seed();
}

async function status() {
  const tables = ['users', 'attendance', 'correction_requests', 'notifications', 'hr_sync_log', 'audit_logs'];
  console.log('');
  console.log('  Table                  Rows');
  console.log('  ─────────────────────────────');
  for (const table of tables) {
    try {
      const [{ count }] = await db(table).count('* as count');
      console.log(`  ${table.padEnd(22)} ${count}`);
    } catch {
      console.log(`  ${table.padEnd(22)} (not found)`);
    }
  }
  console.log('');
}

async function run() {
  try {
    switch (command) {
      case 'migrate': await migrate(); break;
      case 'seed':    await seed();    break;
      case 'reset':   await reset();   break;
      case 'status':  await status();  break;
      default:
        console.log('');
        console.log('  Usage: npm run db:<command>');
        console.log('');
        console.log('  Commands:');
        console.log('    npm run db:migrate   Create tables (safe, keeps existing data)');
        console.log('    npm run db:seed      Insert demo data (skips if data exists)');
        console.log('    npm run db:reset     ⚠️  Wipe everything and reseed from scratch');
        console.log('    npm run db:status    Show row counts for all tables');
        console.log('');
    }
  } catch (e) {
    console.error('');
    console.error('❌ Error:', e.message);
    if (e.message.includes('ECONNREFUSED'))
      console.error('   → PostgreSQL is not running. Start it from Windows Services or pgAdmin.');
    else if (e.message.includes('ENOTFOUND'))
      console.error('   → Hostname not found.\n     If using Supabase: use the Transaction pooler URL (port 6543),\n     not the direct connection URL (port 5432). See SETUP.md.');
    else if (e.message.includes('password authentication'))
      console.error('   → Wrong password. Check DATABASE_URL in .env');
    else if (e.message.includes('does not exist'))
      console.error('   → Database not found. Check DATABASE_URL in .env');
    console.error('');
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

run();
