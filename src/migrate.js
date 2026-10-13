const db = require('./db');

// All tables in creation order (dependencies first)
const TABLES = [
  {
    name: 'users',
    define: t => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('email').notNullable();
      t.string('password').notNullable();
      t.string('staff_id').notNullable();
      t.string('department').defaultTo('General');
      t.enu('role', ['EMPLOYEE', 'HOD', 'HR', 'ADMIN']).defaultTo('EMPLOYEE');
      t.integer('hod_id').references('users.id').onDelete('SET NULL');
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);
    },
    // Raw SQL constraints added separately so they're safe to skip if they exist
    constraints: [
      `ALTER TABLE users ADD CONSTRAINT users_email_unique   UNIQUE (email)`,
      `ALTER TABLE users ADD CONSTRAINT users_staff_id_unique UNIQUE (staff_id)`,
    ],
  },
  {
    name: 'attendance',
    define: t => {
      t.increments('id').primary();
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.string('date', 10).notNullable();
      t.string('clock_in',  8);
      t.string('clock_out', 8);
      t.enu('source', ['HR_SYSTEM', 'CORRECTED', 'MANUAL']).defaultTo('HR_SYSTEM');
      t.string('hr_record_id');
      t.timestamp('synced_at');
      t.timestamps(true, true);
    },
    constraints: [
      `ALTER TABLE attendance ADD CONSTRAINT attendance_user_date_unique UNIQUE (user_id, date)`,
    ],
  },
  {
    name: 'correction_requests',
    define: t => {
      t.increments('id').primary();
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.integer('attendance_id').notNullable().references('attendance.id').onDelete('CASCADE');
      t.string('date', 10).notNullable();
      t.string('field_missing').notNullable();
      t.string('proposed_time').notNullable();
      t.text('justification').notNullable();
      t.text('evidence');
      t.enu('status', ['PENDING', 'APPROVED', 'REJECTED']).defaultTo('PENDING');
      t.integer('hod_id').references('users.id');
      t.text('hod_remarks');
      t.timestamp('decided_at');
      t.boolean('hr_synced').defaultTo(false);
      t.string('hr_sync_status');
      t.text('hr_sync_error');
      t.timestamp('hr_synced_at');
      t.timestamps(true, true);
    },
    constraints: [],
  },
  {
    name: 'notifications',
    define: t => {
      t.increments('id').primary();
      t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.string('type').notNullable();
      t.string('title').notNullable();
      t.text('message').notNullable();
      t.boolean('is_read').defaultTo(false);
      t.integer('ref_id');
      t.timestamp('created_at').defaultTo(db.fn.now());
    },
    constraints: [],
  },
  {
    name: 'hr_sync_log',
    define: t => {
      t.increments('id').primary();
      t.string('direction').notNullable();
      t.string('status').notNullable();
      t.integer('records_affected').defaultTo(0);
      t.text('detail');
      t.text('error');
      t.timestamp('created_at').defaultTo(db.fn.now());
    },
    constraints: [],
  },
  {
    name: 'audit_logs',
    define: t => {
      t.increments('id').primary();
      t.integer('actor_id').references('users.id');
      t.string('action').notNullable();
      t.string('target');
      t.text('detail');
      t.string('ip');
      t.timestamp('created_at').defaultTo(db.fn.now());
    },
    constraints: [],
  },
];

async function migrate() {
  for (const table of TABLES) {
    const exists = await db.schema.hasTable(table.name);

    if (!exists) {
      await db.schema.createTable(table.name, table.define);
      console.log(`   created: ${table.name}`);

      // Apply constraints separately — safe because we just created the table
      for (const sql of table.constraints) {
        await db.raw(sql);
      }
    } else {
      // Table exists — apply any constraints that may be missing
      // Uses IF NOT EXISTS so it's safe to run repeatedly
      for (const sql of table.constraints) {
        const safeSQL = sql.replace(
          /ADD CONSTRAINT (\S+)/,
          'ADD CONSTRAINT IF NOT EXISTS $1'
        );
        await db.raw(safeSQL).catch(() => {
          // Silently skip if DB doesn't support IF NOT EXISTS syntax
        });
      }
    }
  }

  console.log('✅ Migrations complete.');
}

module.exports = migrate;
