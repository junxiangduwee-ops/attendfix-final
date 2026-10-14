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
  const hash   = pw => bcrypt.hashSync(pw, 10);

  const [{ count }] = await db('users').count('id as count');
  if (parseInt(count) > 0) {
    console.log('⚠️  Users table is not empty — skipping seed.');
    console.log('   Run "npm run db:reset" to wipe and reseed from scratch.');
    return;
  }

  // HR Admin
  await db('users').insert({ name:'HR Admin', email:'hr@mrdiy.com', password:hash('hr123'), staff_id:'HR-001', department:'Human Resources', role:'HR' });

  // HODs — one per department
  const depts = [
    { dept:'Operations',      name:'Rashid Hamdan',     email:'rashid.hamdan@mrdiy.com',     staff_id:'H-00101' },
    { dept:'Retail',          name:'Fauziah Ismail',    email:'fauziah.ismail@mrdiy.com',    staff_id:'H-00102' },
    { dept:'Logistics',       name:'Zulkifli Nordin',   email:'zulkifli.nordin@mrdiy.com',   staff_id:'H-00103' },
    { dept:'Finance',         name:'Lim Bee Ching',     email:'lim.beeching@mrdiy.com',      staff_id:'H-00104' },
    { dept:'Human Resources', name:'Priya Subramaniam', email:'priya.subramaniam@mrdiy.com', staff_id:'H-00105' },
  ];
  const hodMap = {};
  for (const d of depts) {
    const [hod] = await db('users').insert({ name:d.name, email:d.email, password:hash('hod123'), staff_id:d.staff_id, department:d.dept, role:'HOD' }).returning('*');
    hodMap[d.dept] = hod.id;
  }

  // 30 Employees — 6 per department
  const employees = [
    { name:'Ahmad Razif Bin Bakar',  email:'ahmad.razif@mrdiy.com',    staff_id:'E-04291', dept:'Operations'      },
    { name:'Mohd Hafiz Bin Yusof',   email:'mohd.hafiz@mrdiy.com',     staff_id:'E-04292', dept:'Operations'      },
    { name:'Nurul Huda Bt Ramlan',   email:'nurul.huda@mrdiy.com',     staff_id:'E-04293', dept:'Operations'      },
    { name:'Azri Bin Othman',        email:'azri.othman@mrdiy.com',    staff_id:'E-04294', dept:'Operations'      },
    { name:'Saleha Bt Zainal',       email:'saleha.zainal@mrdiy.com',  staff_id:'E-04295', dept:'Operations'      },
    { name:'Firdaus Bin Kassim',     email:'firdaus.kassim@mrdiy.com', staff_id:'E-04296', dept:'Operations'      },
    { name:'Nurul Ain Bt Hamid',     email:'nurul.ain@mrdiy.com',      staff_id:'E-04287', dept:'Retail'          },
    { name:'Kavitha Rajasekaran',    email:'kavitha.raja@mrdiy.com',   staff_id:'E-04288', dept:'Retail'          },
    { name:'Tan Wei Liang',          email:'tan.weiliang@mrdiy.com',   staff_id:'E-04289', dept:'Retail'          },
    { name:'Norashikin Bt Musa',     email:'norashikin.musa@mrdiy.com',staff_id:'E-04290', dept:'Retail'          },
    { name:'Rajendran Pillai',       email:'rajendran.p@mrdiy.com',    staff_id:'E-04281', dept:'Retail'          },
    { name:'Wong Mei Ling',          email:'wong.meiling@mrdiy.com',   staff_id:'E-04282', dept:'Retail'          },
    { name:'Siti Rahimah Bt Alias',  email:'siti.rahimah@mrdiy.com',   staff_id:'E-04318', dept:'Logistics'       },
    { name:'Hairul Azwan Bin Daud',  email:'hairul.azwan@mrdiy.com',   staff_id:'E-04319', dept:'Logistics'       },
    { name:'Rosnah Bt Ibrahim',      email:'rosnah.ibrahim@mrdiy.com', staff_id:'E-04320', dept:'Logistics'       },
    { name:'Syafiq Bin Zamri',       email:'syafiq.zamri@mrdiy.com',   staff_id:'E-04321', dept:'Logistics'       },
    { name:'Chong Kok Wai',          email:'chong.kokwai@mrdiy.com',   staff_id:'E-04322', dept:'Logistics'       },
    { name:'Munirah Bt Saari',       email:'munirah.saari@mrdiy.com',  staff_id:'E-04323', dept:'Logistics'       },
    { name:'Noraini Bt Mansor',      email:'noraini.mansor@mrdiy.com', staff_id:'E-04340', dept:'Finance'         },
    { name:'Arif Bin Zainudin',      email:'arif.zainudin@mrdiy.com',  staff_id:'E-04341', dept:'Finance'         },
    { name:'Stella Ong Hui Yin',     email:'stella.ong@mrdiy.com',     staff_id:'E-04342', dept:'Finance'         },
    { name:'Mohd Amirul Bin Salleh', email:'mohd.amirul@mrdiy.com',    staff_id:'E-04343', dept:'Finance'         },
    { name:'Dayang Norfazlina',      email:'dayang.norfaz@mrdiy.com',  staff_id:'E-04344', dept:'Finance'         },
    { name:'Suresh Kumar A/L Raman', email:'suresh.kumar@mrdiy.com',   staff_id:'E-04345', dept:'Finance'         },
    { name:'Zarina Bt Ghazali',      email:'zarina.ghazali@mrdiy.com', staff_id:'E-04360', dept:'Human Resources' },
    { name:'Hafizuddin Bin Razali',  email:'hafizuddin.r@mrdiy.com',   staff_id:'E-04361', dept:'Human Resources' },
    { name:'Umi Kalthum Bt Bahari',  email:'umi.kalthum@mrdiy.com',    staff_id:'E-04362', dept:'Human Resources' },
    { name:'Ng Boon Keong',          email:'ng.boonkeong@mrdiy.com',   staff_id:'E-04363', dept:'Human Resources' },
    { name:'Asmah Bt Razak',         email:'asmah.razak@mrdiy.com',    staff_id:'E-04364', dept:'Human Resources' },
    { name:'Venkatesh A/L Pillai',   email:'venkatesh.p@mrdiy.com',    staff_id:'E-04365', dept:'Human Resources' },
  ];

  for (const e of employees) {
    await db('users').insert({ name:e.name, email:e.email, password:hash('emp123'), staff_id:e.staff_id, department:e.dept, role:'EMPLOYEE', hod_id:hodMap[e.dept] });
  }

  console.log('✅ Demo data seeded — 5 HODs, 30 employees, 1 HR Admin.');
  console.log('');
  console.log('   Login with any employee email / emp123');
  console.log('   Login with any HOD email      / hod123');
  console.log('   hr@mrdiy.com                  / hr123');
  console.log('');
  console.log('   Then upload dummy_attendance.xlsx via HR Sync to load attendance data.');
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
